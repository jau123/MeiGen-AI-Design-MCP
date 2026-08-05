/**
 * check_generation — 按 ID 查询生成状态(2026-08-05 五审 P1 配套)。
 *
 * 用途:generate_image / generate_video 轮询中断(网络/宿主超时/安全阀)后,任务仍在
 * 服务端跑且已扣点 —— 错误信息里带的 Generation ID 用本工具续查,而不是盲目重试双扣。
 * 配置了 API token 时走服务端归属校验;未配置时按 id 公开查询(过渡期兼容,与 web 一致)。
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import type { MeiGenApiClient } from '../lib/meigen-api.js'
import { releaseByGenerationId } from '../lib/attempt-store.js'

export function registerCheckGeneration(server: McpServer, apiClient: MeiGenApiClient) {
  server.tool(
    'check_generation',
    'Check a MeiGen generation by ID — the follow-up for interrupted generate_image / generate_video polling (the error message includes the Generation ID). Returns result URLs when done. The server keeps jobs alive well beyond a single tool call; if still processing, retry later instead of re-submitting (re-submitting costs credits again).',
    {
      generationId: z.string().min(1).describe('Generation ID from a generate_image / generate_video response or error message'),
    },
    async ({ generationId }) => {
      try {
        const status = await apiClient.getGenerationStatus(generationId)
        if (status.status === 'processing') {
          if (typeof status.pollHintSeconds === 'number' && status.pollHintSeconds <= 0) {
            return {
              content: [{
                type: 'text' as const,
                text: 'The server-side observation window for this job has ended — if it ultimately fails, credits auto-refund. Check your gallery at https://www.meigen.ai later instead of polling further.',
              }],
            }
          }
          const hint = typeof status.pollHintSeconds === 'number' && status.pollHintSeconds > 0
            ? ` The server will keep resolving it for up to ~${Math.ceil(status.pollHintSeconds / 60)} more minutes.`
            : ''
          return {
            content: [{ type: 'text' as const, text: `Still processing.${hint} Retry check_generation in ~30s.` }],
          }
        }
        if (status.status === 'failed') {
          releaseByGenerationId(generationId)
          return {
            content: [{
              type: 'text' as const,
              text: `Generation failed: ${status.error ?? 'unknown error'}. Credits auto-refund on failure.`,
            }],
            isError: true,
          }
        }
        const urls = status.mediaType === 'video'
          ? [status.videoUrl].filter(Boolean)
          : (status.imageUrls ?? [status.imageUrl]).filter(Boolean)
        if (urls.length === 0) {
          // completed 但 URL 缺失(十三审 P1):不 release(保留挂起尝试防重提双扣),
          // 明确告知带 ID 稍后再查,绝不当成功
          return {
            content: [{
              type: 'text' as const,
              text: `Generation ${generationId} reports completed but the media URL is missing — retry check_generation shortly or look in https://www.meigen.ai gallery. Do NOT re-submit the generation (it would charge again).`,
            }],
            isError: true,
          }
        }
        releaseByGenerationId(generationId) // URL 确认交付:挂起尝试了结,同参数下次是新单
        return {
          content: [{
            type: 'text' as const,
            text: [`Generation completed (${status.mediaType ?? 'image'}).`, ...urls.map((u) => `URL: ${u}`)].join('\n'),
          }],
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: [{ type: 'text' as const, text: `Status check failed: ${message}. The job may still be running — retry shortly.` }],
          isError: true,
        }
      }
    },
  )
}
