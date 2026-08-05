/**
 * MeiGen API HTTP client
 * Used for MeiGen platform mode — calls the hosted generation API
 */

import { createHash, randomUUID } from 'node:crypto'

/**
 * 幂等 attempt 键存储(2026-08-05 六审 P1:每次调用内部重新生成 UUID 挡不住
 * 「提交已扣点但响应丢失 → 宿主重试 → 新 UUID → 双扣」)。
 * 键在「逻辑工具尝试」层生成并跨重试保存:同参数在 ATTEMPT_TTL_MS 内复用同一键,
 * 服务端同事务判重返回原任务;提交成功或被明确拒绝(4xx)后释放。
 * 本地 stdio 进程有状态,模块级 Map 即可(进程重启丢失 = 退化为无幂等,可接受)。
 */
const ATTEMPT_TTL_MS = 10 * 60_000
const pendingAttempts = new Map<string, { key: string; createdAt: number }>()

function attemptKeyFor(body: Record<string, unknown>): { sig: string; key: string } {
  const sig = createHash('sha256').update(JSON.stringify(body)).digest('hex')
  const existing = pendingAttempts.get(sig)
  if (existing && Date.now() - existing.createdAt < ATTEMPT_TTL_MS) {
    return { sig, key: existing.key }
  }
  const key = randomUUID()
  pendingAttempts.set(sig, { key, createdAt: Date.now() })
  return { sig, key }
}

function releaseAttempt(sig: string): void {
  pendingAttempts.delete(sig)
}

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
}

export interface MeiGenGenerationResponse {
  success: boolean
  generationId?: string
  modelId?: string        // 后端返回实际使用的模型 ID(MCP 没传 modelId 时走 DB is_default)
  creditsUsed?: number
  error?: string
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

  /** 提交生成请求:幂等键跨重试保存(同参数 10min 内复用;成功/4xx 释放,网络错误保留) */
  private async submitWithAttemptKey(body: Record<string, unknown>): Promise<MeiGenGenerationResponse> {
    const { sig, key } = attemptKeyFor(body)
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
      // 网络层失败(响应丢失):键保留,宿主重试同参数会复用同键 → 服务端判重不双扣
      throw error
    }
    if (!res.ok || !json.success) {
      // 服务端明确拒绝(402/400 等):该尝试已终结,释放键让下次是全新请求
      releaseAttempt(sig)
      throw new Error(json.error || `Generation failed: ${res.status}`)
    }
    releaseAttempt(sig)
    return json
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
    referenceVideoDuration?: number   // 参考视频时长(秒);传 referenceVideo 必须同时传
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
    if (typeof params.referenceVideoDuration === 'number') body.referenceVideoDuration = params.referenceVideoDuration

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
