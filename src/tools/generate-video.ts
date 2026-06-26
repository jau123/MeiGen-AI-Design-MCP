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
  model: z.string().min(1).describe('Video model ID. Use list_models to see available video models. Common (as of writing): "seedance-2-0" (multi-tier general purpose), "happyhorse-1.1" (cost-effective i2v/t2v), "veo-3.1" (Google Veo with two tiers, 4/6/8s, native audio), "grok-video" (xAI Grok Imagine 1.5 — IMAGE-TO-VIDEO ONLY: firstFrame REQUIRED, pure text-to-video is rejected; native audio; 4-15s; 480p/720p).'),
  tier: z.string().optional()
    .describe('Quality tier — only for models that support tiers. seedance-2-0 accepts "mini" (default, cheapest; 480p/720p, supports reference video), "fast" (480p/720p), or "pro" (highest fidelity; native 1080p and 4K); veo-3.1 accepts "fast" (default) or "pro". Tiers may be added by the platform — call list_models to see what each model exposes.'),
  duration: z.number().int().positive().optional()
    .describe('Video duration in seconds. seedance-2-0 / happyhorse-1.1 currently accept ~3–15s (any integer in range). veo-3.1 accepts exactly 4, 6, or 8 (default 4) — other values will be rejected. Defaults to the model\'s default duration. Call list_models for the current allowed values per model.'),
  resolution: z.string().optional()
    .describe('Output resolution. Common: "480p" / "720p" / "1080p" / "4k" (model-dependent; e.g. Seedance Pro adds 1080p and 4k, while Fast/Mini are 480p/720p only). Use list_models to see what each model supports. Higher resolutions cost more credits per second.'),
  aspectRatio: z.string().optional()
    .describe('Aspect ratio: "16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "auto", "adaptive" (model-dependent). Defaults to "auto" when omitted.'),
  firstFrame: z.string().optional()
    .describe('First-frame image to control where the video starts. Accepts public URL or local file path (auto-uploaded). REQUIRED for grok-video (image-to-video only — backend rejects it without a firstFrame). For seedance/happyhorse/veo it is optional: with no first frame they do pure text-to-video.'),
  lastFrame: z.string().optional()
    .describe('Optional last-frame image to also control where the video ends. Used by seedance-2-0 and veo-3.1; happyhorse-1.1 ignores this field. Accepts public URL or local file path. Requires firstFrame to also be provided — passing lastFrame alone is rejected.'),
  referenceVideo: z.string().optional()
    .describe(
      'Optional reference video URL for Seedance 2.0 "video continuation". Must be a publicly accessible HTTPS URL (typically a previous generation result `videoUrl`); local paths are not supported. Only seedance-2-0 accepts this — passing it with other models will fail. ' +
      'IMPORTANT — prompt requirement: to make the new clip semantically continue the reference, the `prompt` MUST explicitly say "extend" / "continue" (e.g. prefix with "Extend this video with the following plot:"). Without that, the model treats the video as visual reference only and the new clip may drift from a true continuation. ' +
      'Output behavior: the output is ONLY your `duration` seconds (4-15s) of new content — the reference video is NOT concatenated into the output. To get a single "original + new" clip the user must stitch them locally. ' +
      'Billing: credits are charged at the With-reference-video rate, with `billable_seconds = max(reference_duration + duration, min_billable[duration])`. Total cost is often higher than direct generation of the same output length. Always pass `referenceVideoDuration` alongside this field — omitting it causes underbilling and broken continuation behavior.'
    ),
  referenceVideoDuration: z.number().int().positive().optional()
    .describe('Duration of the reference video in seconds (typically 2–15 — backend validates the current allowed range). REQUIRED whenever `referenceVideo` is set; if omitted the backend treats it as 0, leading to undercharged credits and misconfigured generation. Pass the actual duration of the clip at `referenceVideo`.'),
}

export function registerGenerateVideo(server: McpServer, apiClient: MeiGenApiClient, config: MeiGenConfig) {
  server.tool(
    'generate_video',
    'Generate a video using AI via MeiGen platform. Supports text-to-video, image-to-video (first/last frame), and reference-video continuation (Seedance 2.0 only — pass `referenceVideo` URL + `referenceVideoDuration` together, and prompt must explicitly say "extend / continue"). Available models include Seedance 2.0 (mini/fast/pro tiers, mini is the cheapest default, 4-15s), Happyhorse 1.1 (cost-effective, 3-15s), Veo 3.1 (fast/pro tiers, 4/6/8s, native audio), and Grok Video 1.5 (`grok-video`, xAI — IMAGE-TO-VIDEO ONLY, firstFrame required, native audio, 4-15s, 480p/720p). Pricing varies — seedance/happyhorse/grok are per-second, veo is per-generation by tier × duration. See https://www.meigen.ai/model-comparison for the current schedule. With a reference video (seedance only), billable seconds = max(reference_duration + duration, min_billable[duration]); total often higher than direct generation. Generation typically takes 1–5 minutes (veo at 4k can take up to ~8 min).',
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
        // grok-video is image-to-video only — firstFrame is mandatory (backend rejects without it).
        // Guard client-side for a clearer error, matching the other model-aware checks below.
        if (model === 'grok-video' && !firstFrame) {
          throw new Error('grok-video is image-to-video only — firstFrame is required. For text-to-video use seedance-2-0 / happyhorse-1.1 / veo-3.1.')
        }

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

        // 参考视频(续写)校验:必须是 https URL,且必须配对传 referenceVideoDuration
        // 漏传 duration 会被后端按 0 处理 → 计费偏低 + 续写效果异常(主项目 docs 已明示)
        if (referenceVideo) {
          if (isLocalPath(referenceVideo)) {
            throw new Error('referenceVideo must be a public HTTPS URL (local paths are not supported — upload the clip first or use a previous generation\'s videoUrl).')
          }
          const unsafe = unsafeReferenceUrlReason(referenceVideo)
          if (unsafe) {
            throw new Error(`referenceVideo URL rejected: ${unsafe}. URL: ${referenceVideo}`)
          }
          if (typeof referenceVideoDuration !== 'number') {
            throw new Error('referenceVideoDuration is required when referenceVideo is set (pass the clip duration in seconds, 2-15).')
          }
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
            referenceVideoDuration,
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
