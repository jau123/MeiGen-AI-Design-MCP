/**
 * generate_video Tool — MeiGen-only, requires authentication
 * Wraps the same /api/generate/v2 endpoint with video-specific parameters.
 */

import { z } from 'zod'
import { existsSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { randomBytes } from 'crypto'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js'
import type { ServerRequest, ServerNotification } from '@modelcontextprotocol/sdk/types.js'
import type { MeiGenConfig } from '../config.js'
import { getAvailableProviders } from '../config.js'
import type { MeiGenApiClient } from '../lib/meigen-api.js'
import { sharedApiSemaphore, classifyError } from '../lib/generation-shared.js'
import { addRecentGeneration } from '../lib/preferences.js'
import { processAndUploadImage } from '../lib/upload.js'
import { unsafeReferenceUrlReason } from '../lib/url-safety.js'

// 已知图片扩展名 — 拿来给 firstFrame 做最简单的 sniff
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|heic|heif)(\?|$)/i

async function notify(extra: RequestHandlerExtra<ServerRequest, ServerNotification>, message: string) {
  try {
    await extra.sendNotification({
      method: 'notifications/message',
      params: { level: 'info', logger: 'generate_video', data: message },
    })
  } catch {
    // ignore
  }
}

function isLocalPath(ref: string): boolean {
  if (ref.startsWith('http://') || ref.startsWith('https://')) return false
  if (ref.startsWith('file://')) return true
  return ref.startsWith('/') || ref.startsWith('~') || /^[A-Z]:[/\\]/i.test(ref)
}

function resolveLocalPath(ref: string): string {
  if (ref.startsWith('file://')) return ref.slice(7)
  if (ref.startsWith('~')) return homedir() + ref.slice(1)
  return ref
}

async function resolveFrameImage(
  ref: string,
  config: MeiGenConfig,
  notifyFn: (msg: string) => Promise<void>,
  label: string,
): Promise<string> {
  if (!isLocalPath(ref)) {
    // Defense-in-depth: reject file://, data:, private IPs, cloud metadata
    // before relaying to the backend (which fetches the URL server-side).
    const unsafe = unsafeReferenceUrlReason(ref)
    if (unsafe) {
      throw new Error(`${label} URL rejected: ${unsafe}. URL: ${ref}`)
    }
    // Otherwise pass through — backend handles CDN URLs (with or without extension).
    return ref
  }

  const filePath = resolveLocalPath(ref)
  if (!existsSync(filePath)) {
    throw new Error(`${label} image not found: ${filePath}`)
  }
  if (!IMAGE_EXT_RE.test(filePath)) {
    throw new Error(`${label} must be an image (.png/.jpg/.webp/.heic), got: ${filePath}`)
  }

  await notifyFn(`Uploading ${label}: ${filePath}...`)
  const result = await processAndUploadImage(filePath, config)
  return result.publicUrl
}

/**
 * Save remote video locally.
 * Priority: MEIGEN_VIDEO_OUTPUT_DIR → XDG_VIDEOS_DIR (Linux) → ~/Movies/meigen/
 * (macOS/Windows). Returns file path or undefined on failure.
 */
async function saveVideoLocally(videoUrl: string): Promise<string | undefined> {
  try {
    const res = await fetch(videoUrl)
    if (!res.ok) return undefined
    const buffer = Buffer.from(await res.arrayBuffer())
    const date = new Date().toISOString().slice(0, 10)
    const id = randomBytes(4).toString('hex')
    const filename = `${date}_${id}.mp4`
    const expandTilde = (p: string) => p.startsWith('~') ? homedir() + p.slice(1) : p
    const custom = process.env.MEIGEN_VIDEO_OUTPUT_DIR
    const xdgVideos = process.env.XDG_VIDEOS_DIR
    const dir = custom
      ? expandTilde(custom)
      : xdgVideos
        ? join(expandTilde(xdgVideos), 'meigen')
        : join(homedir(), 'Movies', 'meigen')
    mkdirSync(dir, { recursive: true })
    const filePath = join(dir, filename)
    writeFileSync(filePath, buffer)
    return filePath
  } catch {
    return undefined
  }
}

export const generateVideoSchema = {
  prompt: z.string().trim().min(1, 'Prompt cannot be empty').describe('The video generation prompt. Describe motion, scene, and style — not just the still image.'),
  model: z.string().min(1).describe('Video model ID. REQUIRED; call list_models for the live lineup and capabilities.'),
  tier: z.string().optional()
    .describe('Optional model tier. Use list_models for the selected model\'s live tier values.'),
  duration: z.number().int().positive().optional()
    .describe('Video duration in seconds. Use list_models for the model\'s enum/range; when omitted the server uses the omitted-request default shown there.'),
  resolution: z.string().optional()
    .describe('Output resolution. Use list_models for the selected model/tier\'s live values.'),
  aspectRatio: z.string().optional()
    .describe('Aspect ratio: "16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "auto", "adaptive" (model-dependent). Defaults to "auto" when omitted.'),
  firstFrame: z.string().optional()
    .describe('First-frame image when required or supported by the selected model. Accepts a public URL or local file path (auto-uploaded); use list_models and let the server enforce the live model contract.'),
  lastFrame: z.string().optional()
    .describe('Optional last-frame image for a model that supports it. Accepts a public URL or local file path; requires firstFrame. Use list_models for the live model contract.'),
  referenceVideo: z.string().optional()
    .describe(
      'Optional reference video URL for a model that advertises reference-video support in list_models. Must be a MeiGen video URL on images.meigen.ai (a previous generation result `videoUrl`, or a clip uploaded via meigen.ai) — other domains are rejected because billing metadata must be verifiable; local paths are not supported. ' +
      'IMPORTANT — prompt requirement: to make the new clip semantically continue the reference, the `prompt` MUST explicitly say "extend" / "continue" (e.g. prefix with "Extend this video with the following plot:"). Without that, the model treats the video as visual reference only and the new clip may drift from a true continuation. ' +
      'Output behavior: the output is only the configured `duration` of new content — the reference video is not concatenated into the output. ' +
      'Billing may include the reference clip and model-specific minimums. The server probes authoritative MP4 duration; do not estimate billing from client metadata.'
    ),
  referenceVideoDuration: z.number().int().positive().optional()
    .describe('Deprecated compatibility hint. Ignored because the server probes authoritative MP4 duration.'),
}

export function registerGenerateVideo(server: McpServer, apiClient: MeiGenApiClient, config: MeiGenConfig) {
  server.tool(
    'generate_video',
    'Generate a video using a required MeiGen model ID. Model lineup, tiers, resolutions, output-duration enum/range and reference-video range are live capabilities served by list_models; do not rely on snapshots. The server validates and prices every combination before dispatch. Video generation is slow and costs credits — confirm before submitting and never run videos in parallel.',
    generateVideoSchema,
    { readOnlyHint: false, destructiveHint: true },
    async ({ prompt, model, tier, duration, resolution, aspectRatio, firstFrame, lastFrame, referenceVideo, referenceVideoDuration }, extra) => {
      const providers = getAvailableProviders(config)
      if (!providers.includes('meigen')) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Video generation requires a MeiGen API token.\n\n1. Get one at https://www.meigen.ai (sign in → avatar → Settings → API Keys)\n2. Make the token available:\n   - **On Claude Code**: run `/meigen:setup` and paste the token\n   - **On other hosts**: export `MEIGEN_API_TOKEN=meigen_sk_...` in your shell, or add it to your MCP config\'s env block for the meigen server',
          }],
          isError: true,
        }
      }

      let generationId: string | undefined

      try {
        const refList: string[] = []
        if (firstFrame) {
          refList.push(await resolveFrameImage(firstFrame, config, (msg) => notify(extra, msg), 'first frame'))
        }
        if (lastFrame) {
          if (!firstFrame) {
            // lastFrame 单独传无意义(vendor i2v 只看 firstFrameUrl + 可选 lastFrameUrl,需配对)
            throw new Error('lastFrame requires firstFrame to also be provided')
          }
          refList.push(await resolveFrameImage(lastFrame, config, (msg) => notify(extra, msg), 'last frame'))
        }
        const referenceImages = refList.length > 0 ? refList : undefined

        // 参考视频(续写)校验:必须是 https URL;referenceVideoDuration 可选且仅供参考
        // (服务端从 MP4 权威探测计费/裁剪时长,漏传不再少扣)
        if (referenceVideo) {
          if (isLocalPath(referenceVideo)) {
            throw new Error('referenceVideo must be a public HTTPS URL (local paths are not supported — upload the clip first or use a previous generation\'s videoUrl).')
          }
          const unsafe = unsafeReferenceUrlReason(referenceVideo)
          if (unsafe) {
            throw new Error(`referenceVideo URL rejected: ${unsafe}. URL: ${referenceVideo}`)
          }
          // referenceVideoDuration 不再必填(十二审 P2):服务端从 MP4 权威探测计费/裁剪时长,
          // 客户端值仅作参考;不传不再少扣
        } else if (typeof referenceVideoDuration === 'number') {
          throw new Error('referenceVideoDuration was passed without referenceVideo — drop it, or pass a referenceVideo URL.')
        }

        await sharedApiSemaphore.acquire()
        try {
          // 1. Submit
          const genResponse = await apiClient.generateVideo({
            prompt,
            modelId: model,
            aspectRatio: aspectRatio || 'auto',
            resolution,
            duration,
            tier,
            referenceImages,
            referenceVideo,
            // referenceVideoDuration intentionally omitted: server probes MP4 and it must not
            // participate in the idempotency signature.
          })

          if (!genResponse.generationId) {
            throw new Error('No generation ID returned')
          }
          generationId = genResponse.generationId

          await notify(extra, 'Video generation submitted, waiting for result...')

          // 2. Poll(服务端 pollHintSeconds 驱动;本地仅安全阀)
          let status
          try {
            status = await apiClient.waitForGeneration(
              generationId,
              undefined,
              async (elapsedMs) => {
                await notify(extra, `Still generating video... (${Math.round(elapsedMs / 1000)}s elapsed)`)
              },
            )
          } catch (pollError) {
            // 任务已建已扣费:挂起幂等尝试(同参数重试续查同一任务,不再提交扣费,十一审)
            apiClient.suspendAttemptFor(genResponse._attempt, generationId)
            throw pollError
          }


          if (status.status === 'failed') {
            // 明确失败(服务端已退款):尝试终结
            apiClient.ackAttempt(genResponse._attempt)
            throw new Error(status.error || 'Video generation failed')
          }

          // mediaType guard: 防止用户传 image model id 给 generate_video,导致拿 jpg 写成 .mp4
          // 图片模型误用:任务已完成已扣费,返回**成功**(图片 URL + ID),绝不抛错 ——
          // 抛错并提示改用 generate_image 会诱导再次提交双扣(十审 P1,对称 generate_image 的同款修复)
          if (status.mediaType && status.mediaType !== 'video') {
            const imgUrls = (status.imageUrls?.length ? status.imageUrls : [status.imageUrl]).filter(Boolean)
            if (imgUrls.length === 0) {
              // 误用 + URL 缺失复合异常(workflow 六审 C0):ack 必须在交付确认后 ——
              // 提前 ack 会让同参数重试铸新键双扣;挂起保 ID 续查,对称 generate_image
              apiClient.suspendAttemptFor(genResponse._attempt, generationId)
              throw new Error(`Generation ${generationId} completed as ${status.mediaType} but the response is missing the media URL — use check_generation; do NOT re-submit (it would charge again).`)
            }
            apiClient.ackAttempt(genResponse._attempt)
            return {
              content: [{
                type: 'text' as const,
                text: [
                  `This model produced ${status.mediaType?.toUpperCase() ?? 'an IMAGE'} (you were charged once — do NOT re-submit).`,
                  ...imgUrls.map((u) => `Image URL: ${u}`),
                  `Generation ID: ${generationId}`,
                  'Next time use the generate_image tool for this model.',
                ].join('\n'),
              }],
            }
          }

          const videoUrl = status.videoUrl
          if (!videoUrl) {
            // URL 缺失:挂起(重试续查同任务)+ 带 ID 抛(十二审 P1)
            apiClient.suspendAttemptFor(genResponse._attempt, generationId)
            throw new Error(`Generation ${generationId} completed but the response is missing the video URL — check https://www.meigen.ai gallery or use check_generation; do NOT re-submit (it would charge again).`)
          }
          // URL 已确认:尝试终结(十二审 P1:ack 必须在交付确认后)
          apiClient.ackAttempt(genResponse._attempt)

          await notify(extra, 'Downloading video...')
          const savedPath = await saveVideoLocally(videoUrl)

          const actualModel = genResponse.modelId || model
          addRecentGeneration({ prompt, provider: 'meigen', model: actualModel, aspectRatio })

          const lines = [`Video generated successfully.`]
          lines.push(`- Provider: MeiGen (model: ${actualModel}${tier ? `, tier: ${tier}` : ''})`)
          if (typeof duration === 'number') lines.push(`- Duration: ${duration}s`)
          if (resolution) lines.push(`- Resolution: ${resolution}`)
          lines.push(`- Video URL: ${videoUrl}`)
          if (savedPath) lines.push(`- Saved to: ${savedPath}`)
          lines.push(`\nVideo URLs may expire — download or save the file if you need long-term access.`)

          return {
            content: [{ type: 'text' as const, text: lines.join('\n') }],
          }
        } finally {
          sharedApiSemaphore.release()
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const guidance = classifyError(message)
        // 超时特殊提示:任务可能仍在后台跑,提醒用户避免重复扣费
        // 后端 pg_cron cleanup_orphan_generations 会在 ~15min 内对"从未启动"的孤儿任务自动退款
        const timeoutHint = generationId
          ? `\n\nGeneration ID: ${generationId}. The job may still complete in the background — check https://www.meigen.ai before retrying. If the backend job never started, credits are automatically refunded within ~15 minutes.`
          : ''
        return {
          content: [{
            type: 'text' as const,
            text: `Video generation failed: ${message}\n\n${guidance}${timeoutHint}`,
          }],
          isError: true,
        }
      }
    }
  )
}
