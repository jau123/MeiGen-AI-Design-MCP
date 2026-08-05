/**
 * MeiGen API HTTP client
 * Used for MeiGen platform mode — calls the hosted generation API
 */

import { createHash, randomUUID } from 'node:crypto'

import { acquireAttempt, markAttemptRetryable, releaseAttempt, suspendAttempt } from './attempt-store.js'

import type { MeiGenConfig } from '../config.js'

export interface MeiGenSearchResult {
  id: string
  text: string
  thumbnail_url: string | null
  media_urls: string[] | null
  author_username: string | null
  author_display_name: string | null
  likes: number
  views: number
  model: string | null
  prompt_ready: boolean | null
  image_width: number | null
  image_height: number | null
}

export interface MeiGenModel {
  id: string
  name: string
  provider: string
  description: string | null
  credits_per_generation: number
  supports_4k: boolean
  supported_ratios: string[]
  api_provider: string
  request_transform: string
  media_type?: 'image' | 'video'
  max_reference_images?: number
  extra_config?: {
    resolutions?: string[]
    // Per-tier resolution overrides (e.g. Seedance Pro adds 4k while mini/fast cap at 720p).
    // The model-level `resolutions` field lags behind this — always merge both.
    tierResolutions?: Record<string, string[]>
    qualities?: string[]
    defaultResolution?: string
    defaultQuality?: string
    pricing?: unknown
    hidden?: boolean
    tiers?: string[]
    defaultTier?: string
    durations?: number[]
    defaultDuration?: number
    pricingPerSec?: unknown
    pricingPerSecWithVideo?: unknown
    supportsReferenceVideo?: boolean
    // Operational signals from backend admin (e.g., "New", "Busy", "Maintenance").
    // Surface in list_models so users can avoid picking a degraded model.
    tags?: string[]
    [key: string]: unknown
  } | null
  /** Stable public capability contract from /api/models. Do not parse pricing fields for support. */
  capabilities?: {
    video?: {
      valid?: boolean
      outputDuration:
        | { kind: 'enum'; values: number[]; default: number }
        | { kind: 'range'; min: number; max: number; step: number; default: number }
        | null
      referenceVideo: {
        enabled: boolean
        minSeconds: number
        maxSeconds: number
        tiers?: string[]
        resolutions?: string[]
        resolutionsByTier?: Record<string, string[]>
        maxUploadBytes?: number
      }
      billing?: {
        mode: 'per_second' | 'per_call'
        requestDefaultSeconds: number
        referenceSeconds?:
          | 'output_only'
          | 'reference_plus_output'
          | 'reference_plus_output_with_minimum_table'
      } | null
      requiresFirstFrame: boolean
    }
  }
}

export interface MeiGenGenerationResponse {
  success: boolean
  generationId?: string
  modelId?: string        // 后端返回实际使用的模型 ID(MCP 没传 modelId 时走 DB is_default)
  creditsUsed?: number
  error?: string
  /** 命中「任务已建但轮询中断」的挂起尝试,未重新提交(直接续查该任务) */
  reusedPrior?: boolean
  /** 幂等尝试句柄(内部):工具层终态 ackAttempt / 轮询中断 suspendAttemptFor */
  _attempt?: { sig: string; key: string }
}

/**
 * Local anti-hang safety valve for generation polling (NOT a business timeout — the
 * server's `pollHintSeconds` drives when to give up; see waitForGeneration). 45 min
 * comfortably covers the server's 40-min observation window + clock skew.
 */
export const POLL_SAFETY_VALVE_MS = 45 * 60_000

export interface MeiGenGenerationStatus {
  // Backend `status/[id]/route.ts:53` maps DB 'pending' → 'processing' before responding,
  // so callers never observe 'pending' over the wire.
  status: 'processing' | 'completed' | 'failed'
  imageUrl: string | null
  imageUrls: string[] | null
  videoUrl?: string | null
  mediaType?: 'image' | 'video'
  error: string | null
  /** Server-authoritative poll hint (2026-08-05): remaining seconds the server-side
   * pipeline (provider budget + orphan-refund fallback) can still resolve this job.
   * Keep polling while > 0. Absent on older servers — fall back to local safety valve. */
  pollHintSeconds?: number | null
  /** p90 duration estimate for this model+resolution (production percentiles). */
  expectedWaitSeconds?: number | null
}

export class MeiGenApiClient {
  private baseUrl: string
  private apiToken?: string

  constructor(config: MeiGenConfig) {
    this.baseUrl = config.meigenBaseUrl
    this.apiToken = config.meigenApiToken
  }

  /** Search gallery (no auth required) */
  async searchGallery(query: string, limit = 20, offset = 0): Promise<MeiGenSearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      type: 'posts',
      limit: String(limit),
      offset: String(offset),
    })

    const res = await fetch(`${this.baseUrl}/api/search?${params}`)
    if (!res.ok) {
      throw new Error(`Search failed: ${res.status} ${res.statusText}`)
    }

    const json = await res.json() as { success: boolean; data?: MeiGenSearchResult[]; error?: string }
    if (!json.success) {
      throw new Error(json.error || 'Search failed')
    }

    return json.data || []
  }

  /** List available models (no auth required) */
  async listModels(activeOnly = true): Promise<MeiGenModel[]> {
    const params = new URLSearchParams()
    if (!activeOnly) params.set('active', 'false')

    const res = await fetch(`${this.baseUrl}/api/models?${params}`)
    if (!res.ok) {
      throw new Error(`Failed to fetch models: ${res.status} ${res.statusText}`)
    }

    const json = await res.json() as { success: boolean; models?: MeiGenModel[]; error?: string }
    if (!json.success) {
      throw new Error(json.error || 'Failed to fetch models')
    }

    return json.models || []
  }

  /** Get image details by ID (no auth required) */
  async getImageDetails(imageId: string): Promise<MeiGenSearchResult | null> {
    const res = await fetch(`${this.baseUrl}/api/images/${encodeURIComponent(imageId)}`)
    if (!res.ok) {
      if (res.status === 404) return null
      throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`)
    }

    const json = await res.json() as { success: boolean; data?: MeiGenSearchResult; error?: string }
    if (!json.success) return null

    return json.data || null
  }

  /** Generate an image (requires API token) */
  async generateImage(params: {
    prompt: string
    modelId?: string
    aspectRatio?: string
    resolution?: string
    quality?: string
    referenceImages?: string[]
  }): Promise<MeiGenGenerationResponse> {
    if (!this.apiToken) {
      throw new Error('MEIGEN_API_TOKEN is required for image generation via MeiGen')
    }

    // 不在 MCP 侧硬编码模型/分辨率默认值:
    // - modelId 缺省时,让 MeiGen 后端按 DB is_default=true 决定(每个模型的真默认)
    // - resolution 缺省时,让后端按该模型的 extra_config.defaultResolution 决定
    // 这样 MCP 升级周期和后端模型配置完全解耦
    const body: Record<string, unknown> = {
      prompt: params.prompt,
      aspectRatio: params.aspectRatio || 'auto',
    }
    if (params.modelId) {
      body.modelId = params.modelId
    }
    if (params.resolution) {
      body.resolution = params.resolution
    }
    if (params.quality) {
      body.quality = params.quality
    }
    if (params.referenceImages && params.referenceImages.length > 0) {
      body.referenceImages = params.referenceImages
    }

    return await this.submitWithAttemptKey(body)
  }

  /**
   * 提交生成请求(2026-08-05 七审重构):并发同参数各拿新键(两张图=两单,不合并);
   * 网络错误 / 5xx(可能已扣点)→ 键转 retryable 供重试复用;成功 / 4xx 明确拒绝 → 释放。
   */
  private async submitWithAttemptKey(body: Record<string, unknown>): Promise<MeiGenGenerationResponse> {
    const sig = createHash('sha256').update(JSON.stringify(body)).digest('hex')
    const { key, reused, priorGenerationId } = acquireAttempt(sig, randomUUID)
    // 短窗内同参数已成功建单(轮询失败后的宿主重试):不再提交,直接返回原任务
    // 让调用方续查 —— 提交即扣费,重复提交就是双扣(十审 P1)
    if (priorGenerationId) {
      return { success: true, generationId: priorGenerationId, reusedPrior: true, _attempt: { sig, key } } as MeiGenGenerationResponse
    }
    let res: Response
    let json: MeiGenGenerationResponse
    try {
      res = await fetch(`${this.baseUrl}/api/generate/v2`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...body, idempotencyKey: key }),
      })
      json = await res.json() as MeiGenGenerationResponse
    } catch (error) {
      markAttemptRetryable(sig, key)
      throw error
    }
    if (!res.ok || !json.success) {
      // 释放语义(九审收窄 + 十审修订):
      // - 409 idempotency_conflict:服务端明确要求换新键(stale claim),必须释放,
      //   否则复用键每次刷新 TTL 无限自锁(十审 P1)
      // - 5xx / 408 / 429:服务端状态不明或瞬时,保留供重试判重
      // - 复用键遇其他错误:该键可能对应已扣费任务,保留(释放即下次铸新键双扣)
      const isConflict = res.status === 409
      const transient = res.status >= 500 || res.status === 408 || res.status === 429
      if (isConflict) {
        releaseAttempt(sig, key)
      } else if (transient || reused) {
        markAttemptRetryable(sig, key)
      } else {
        releaseAttempt(sig, key)
      }
      throw new Error(json.error || `Generation failed: ${res.status}`)
    }
    // 提交成功 = 任务已建已扣费。键保持 in-flight,生命周期交工具层(十一审):
    // 终态(成功交付/明确失败)→ ackAttempt 释放,「再来一张」永远新单;
    // 轮询中断 → suspendAttemptFor 挂起保留 generationId 供续查。
    return { ...json, _attempt: { sig, key } }
  }

  /** 工具层终态确认:释放幂等尝试(此后同参数是全新生成)。 */
  ackAttempt(attempt?: { sig: string; key: string }): void {
    if (attempt) releaseAttempt(attempt.sig, attempt.key)
  }

  /** 工具层轮询中断:挂起尝试保留任务 ID(同参数重试直接续查,不再提交扣费)。 */
  suspendAttemptFor(attempt: { sig: string; key: string } | undefined, generationId: string): void {
    if (attempt) suspendAttempt(attempt.sig, attempt.key, generationId)
  }

  /** Generate a video (requires API token) */
  async generateVideo(params: {
    prompt: string
    modelId: string  // 视频模型必须显式传(无后端默认)
    aspectRatio?: string
    resolution?: string
    duration?: number
    tier?: string
    referenceImages?: string[]
    referenceVideo?: string           // 仅 Seedance 2.0:参考视频 URL(续写场景)
    referenceVideoDuration?: number   // deprecated compatibility input; never sent (server probes MP4)
  }): Promise<MeiGenGenerationResponse> {
    if (!this.apiToken) {
      throw new Error('MEIGEN_API_TOKEN is required for video generation via MeiGen')
    }

    const body: Record<string, unknown> = {
      modelId: params.modelId,
      prompt: params.prompt,
      aspectRatio: params.aspectRatio || 'auto',
    }
    if (params.resolution) body.resolution = params.resolution
    if (typeof params.duration === 'number') body.duration = params.duration
    if (params.tier) body.tier = params.tier
    if (params.referenceImages?.length) body.referenceImages = params.referenceImages
    if (params.referenceVideo) body.referenceVideo = params.referenceVideo
    // Never send client-reported clip duration: it must not affect request identity or billing.

    return await this.submitWithAttemptKey(body)
  }

  /** Check generation status by ID (no auth required) */
  async getGenerationStatus(generationId: string): Promise<MeiGenGenerationStatus> {
    const res = await fetch(
      `${this.baseUrl}/api/generate/v2/status/${encodeURIComponent(generationId)}`,
      // 带 token 时服务端做归属校验(2026-08-05 六审 IDOR 收敛;无 token 走公开路径兼容)
      this.apiToken ? { headers: { Authorization: `Bearer ${this.apiToken}` } } : undefined,
    )

    if (!res.ok) {
      throw new Error(`Status check failed: ${res.status} ${res.statusText}`)
    }

    return await res.json() as MeiGenGenerationStatus
  }

  /**
   * Poll generation status until the server reports a terminal state.
   *
   * Timeout semantics (2026-08-05 redesign): the server is the authority on how long a
   * job can still resolve — it sends `pollHintSeconds` (remaining observation window
   * covering its provider budget + refund fallback). We keep polling while the server
   * says the job is alive. `safetyValveMs` is a pure anti-hang guard (NOT a business
   * timeout): it only fires if the server signal is absent (older backend) or the
   * process would otherwise wait unreasonably long. Future backend budget changes
   * therefore need no MCP release.
   */
  async waitForGeneration(
    generationId: string,
    safetyValveMs = POLL_SAFETY_VALVE_MS,
    onProgress?: (elapsedMs: number) => Promise<void>,
  ): Promise<MeiGenGenerationStatus> {
    const startTime = Date.now()
    const pollInterval = 3_000
    let lastProgress = 0

    while (Date.now() - startTime < safetyValveMs) {
      const status = await this.getGenerationStatus(generationId)

      if (status.status === 'completed' || status.status === 'failed') {
        return status
      }

      // Server-authoritative stop: observation window exhausted (orphan refund has
      // landed or is imminent) — no point waiting further.
      if (typeof status.pollHintSeconds === 'number' && status.pollHintSeconds <= 0) {
        throw new Error(
          `Generation still processing after server observation window (job ${generationId}); ` +
            'it may still complete — check your gallery, credits auto-refund on failure.'
        )
      }

      const elapsed = Date.now() - startTime
      if (onProgress && elapsed - lastProgress >= 15_000) {
        await onProgress(elapsed)
        lastProgress = elapsed
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    throw new Error(`Generation timed out after ${Math.round((Date.now() - startTime) / 1000)}s (local safety valve)`)
  }
}
