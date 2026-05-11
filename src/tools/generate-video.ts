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
  return ref.startsWith('/') || ref.startsWith('~') || /^[A-Z]:\\/i.test(ref)
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
    // URL 形式: 后端最终判定(支持无扩展名 CDN URL)
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

/** Save remote video to ~/Movies/meigen/ (override with MEIGEN_VIDEO_OUTPUT_DIR). Returns file path or undefined. */
async function saveVideoLocally(videoUrl: string): Promise<string | undefined> {
  try {
    const res = await fetch(videoUrl)
    if (!res.ok) return undefined
    const buffer = Buffer.from(await res.arrayBuffer())
    const date = new Date().toISOString().slice(0, 10)
    const id = randomBytes(4).toString('hex')
    const filename = `${date}_${id}.mp4`
    const custom = process.env.MEIGEN_VIDEO_OUTPUT_DIR
    const dir = custom
      ? (custom.startsWith('~') ? homedir() + custom.slice(1) : custom)
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
  model: z.string().min(1).describe('Video model ID. Use list_models to see available video models. Common (as of writing): "seedance-2-0" (multi-tier general purpose), "happyhorse-1.0" (cost-effective i2v/t2v), "veo-3.1" (Google Veo, fixed 8s with audio).'),
  tier: z.string().optional()
    .describe('Quality tier — only for models that support tiers. seedance-2-0 currently accepts "fast" (default, cheaper) or "pro" (higher fidelity, native 1080p). Tiers may be added by the platform — call list_models to see what each model exposes.'),
  duration: z.number().int().positive().optional()
    .describe('Video duration in seconds. seedance-2-0 / happyhorse-1.0 currently accept ~3–15s. Veo 3.1 is fixed (duration is ignored if passed). Defaults to the model\'s default duration. Call list_models for the current allowed range per model.'),
  resolution: z.string().optional()
    .describe('Output resolution. Common: "480p" / "720p" / "1080p" (model-dependent). Use list_models to see what each model supports. Higher resolutions cost more credits per second.'),
  aspectRatio: z.string().optional()
    .describe('Aspect ratio: "16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "auto", "adaptive" (model-dependent). Defaults to "auto" when omitted.'),
  firstFrame: z.string().optional()
    .describe('Optional first-frame image to control where the video starts. Accepts public URL or local file path (auto-uploaded). Highly recommended for image-to-video; with no first frame the model does pure text-to-video.'),
  lastFrame: z.string().optional()
    .describe('Optional last-frame image to also control where the video ends. Used by seedance-2-0 and veo-3.1; happyhorse-1.0 ignores this field. Accepts public URL or local file path. Requires firstFrame to also be provided — passing lastFrame alone is rejected.'),
}

export function registerGenerateVideo(server: McpServer, apiClient: MeiGenApiClient, config: MeiGenConfig) {
  server.tool(
    'generate_video',
    'Generate a video using AI via MeiGen platform. Supports text-to-video and first-frame image-to-video. Available models include Seedance 2.0 (fast/pro tiers, 4-15s), Happyhorse 1.0 (cost-effective, 3-15s), and Veo 3.1 (fixed 8s with audio). Pricing is per-second except Veo (flat 20 credits per 8s clip) — see https://www.meigen.ai/model-comparison. Generation takes 1–5 minutes typically; reference video continuation (extending an existing clip) is NOT exposed via MCP — direct users to the web UI for that.',
    generateVideoSchema,
    { readOnlyHint: false, destructiveHint: true },
    async ({ prompt, model, tier, duration, resolution, aspectRatio, firstFrame, lastFrame }, extra) => {
      const providers = getAvailableProviders(config)
      if (!providers.includes('meigen')) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Video generation requires a MeiGen API token.\n\n1. Get one at https://www.meigen.ai (sign in → avatar → Settings → API Keys)\n2. Run /meigen:setup and paste your token',
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
          })

          if (!genResponse.generationId) {
            throw new Error('No generation ID returned')
          }
          generationId = genResponse.generationId

          await notify(extra, 'Video generation submitted, waiting for result (typically 1–5 minutes)...')

          // 2. Poll — 视频比图片慢,超时设 8min
          const status = await apiClient.waitForGeneration(
            generationId,
            480_000,
            async (elapsedMs) => {
              await notify(extra, `Still generating video... (${Math.round(elapsedMs / 1000)}s elapsed)`)
            },
          )

          if (status.status === 'failed') {
            throw new Error(status.error || 'Video generation failed')
          }

          // mediaType guard: 防止用户传 image model id 给 generate_video,导致拿 jpg 写成 .mp4
          if (status.mediaType && status.mediaType !== 'video') {
            throw new Error(`This model returned ${status.mediaType}, not video. Use generate_image for image models, or call list_models to see video model IDs.`)
          }

          const videoUrl = status.videoUrl
          if (!videoUrl) {
            throw new Error('No video URL in completed generation')
          }

          await notify(extra, 'Downloading video...')
          const savedPath = await saveVideoLocally(videoUrl)

          const actualModel = genResponse.modelId || model
          addRecentGeneration({ prompt, provider: 'meigen', model: actualModel, aspectRatio })

          const lines = [`Video generated successfully.`]
          lines.push(`- Provider: MeiGen (model: ${actualModel}${tier ? `, tier: ${tier}` : ''})`)
          if (typeof duration === 'number') lines.push(`- Duration: ${duration}s (requested — Veo 3.1 may override to its fixed 8s)`)
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
        const timeoutHint = /timed out|timeout/i.test(message) && generationId
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
