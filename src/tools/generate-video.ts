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
import { Semaphore } from '../lib/semaphore.js'
import { addRecentGeneration } from '../lib/preferences.js'
import { processAndUploadImage } from '../lib/upload.js'

// 与 generate_image 共享 API 信号量(后端是同一 endpoint,同一限速),max 4
const apiSemaphore = new Semaphore(4)

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

async function resolveFirstFrame(
  ref: string | undefined,
  config: MeiGenConfig,
  notifyFn: (msg: string) => Promise<void>,
): Promise<string | undefined> {
  if (!ref) return undefined
  if (!isLocalPath(ref)) return ref

  const filePath = resolveLocalPath(ref)
  if (!existsSync(filePath)) {
    throw new Error(`First frame image not found: ${filePath}`)
  }

  await notifyFn(`Uploading first frame: ${filePath}...`)
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
  prompt: z.string().describe('The video generation prompt. Describe motion, scene, and style — not just the still image.'),
  model: z.string().describe('Video model ID. Use list_models to see available video models. Common: "seedance-2-0" (multi-tier general purpose), "happyhorse-1.0" (cost-effective i2v/t2v), "veo-3.1" (Google Veo, fixed 8s with audio).'),
  tier: z.enum(['fast', 'pro']).optional()
    .describe('Quality tier — only for models that support tiers (e.g. seedance-2-0). "fast" is faster and cheaper; "pro" produces higher fidelity (and for seedance, native 1080p). Defaults to the model\'s default tier when omitted.'),
  duration: z.number().int().min(3).max(15).optional()
    .describe('Video duration in seconds. Range depends on model: seedance/happyhorse 4–15s. Veo 3.1 is fixed at 8s — duration is ignored. Default is 5s.'),
  resolution: z.string().optional()
    .describe('Output resolution. Common: "480p" / "720p" / "1080p" (model-dependent). Use list_models to see what each model supports. Higher resolutions cost more credits per second.'),
  aspectRatio: z.string().optional()
    .describe('Aspect ratio: "16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "auto", "adaptive" (model-dependent). Defaults to "auto" when omitted.'),
  firstFrame: z.string().optional()
    .describe('Optional first-frame image to control where the video starts. Accepts public URL or local file path (auto-uploaded). Highly recommended for image-to-video; with no first frame the model does pure text-to-video.'),
}

export function registerGenerateVideo(server: McpServer, apiClient: MeiGenApiClient, config: MeiGenConfig) {
  server.tool(
    'generate_video',
    'Generate a video using AI via MeiGen platform. Supports text-to-video and first-frame image-to-video. Available models include Seedance 2.0 (fast/pro tiers, 4-15s), Happyhorse 1.0 (cost-effective, 3-15s), and Veo 3.1 (fixed 8s with audio). Pricing is per-second except Veo (flat 20 credits per 8s clip) — see https://www.meigen.ai/model-comparison. Generation takes 1–5 minutes typically; reference video continuation (extending an existing clip) is NOT exposed via MCP — direct users to the web UI for that.',
    generateVideoSchema,
    { readOnlyHint: false, destructiveHint: true },
    async ({ prompt, model, tier, duration, resolution, aspectRatio, firstFrame }, extra) => {
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

      try {
        const referenceImages = firstFrame
          ? [await resolveFirstFrame(firstFrame, config, (msg) => notify(extra, msg)) as string]
          : undefined

        await apiSemaphore.acquire()
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

          await notify(extra, 'Video generation submitted, waiting for result (typically 1–5 minutes)...')

          // 2. Poll — 视频比图片慢,超时设 8min
          const status = await apiClient.waitForGeneration(
            genResponse.generationId,
            480_000,
            async (elapsedMs) => {
              await notify(extra, `Still generating video... (${Math.round(elapsedMs / 1000)}s elapsed)`)
            },
          )

          if (status.status === 'failed') {
            throw new Error(status.error || 'Video generation failed')
          }

          const videoUrl = status.videoUrl || status.imageUrl
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
          apiSemaphore.release()
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: [{
            type: 'text' as const,
            text: `Video generation failed: ${message}\n\nTip: Use list_models to verify the model ID, supported resolutions, durations, and aspect ratios.`,
          }],
          isError: true,
        }
      }
    }
  )
}
