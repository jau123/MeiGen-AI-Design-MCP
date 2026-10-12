/**
 * MeiGen API HTTP client
 * Used for MeiGen platform mode — calls the hosted generation API
 */

import { randomUUID } from 'node:crypto'

import { releaseAttempt, suspendAttempt } from './attempt-store.js'
import { withHttpResponse, boundedJson, responseError, abortableDelay, abortReason } from './generation-http.js'
import { GenerationError } from './generation-contract.js'
import { sharedApiSemaphore } from './generation-shared.js'

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
    characters?: { enabled: boolean; maxCount: number; referenceMode: 'content' }
    videoInputs?: Record<string, unknown>
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
        /** Additive (2026-09): clips per request. Absent on an older cached body ⇒ 1. */
        maxCount?: number
        /** Additive (2026-09): SUM of clip seconds per request. Absent ⇒ maxSeconds. */
        maxTotalSeconds?: number
        tiers?: string[]
        resolutions?: string[]
        resolutionsByTier?: Record<string, string[]>
        maxUploadBytes?: number
      }
      /** Additive (2026-09) reference AUDIO. Absent ⇒ disabled; audio is never billed. */
      referenceAudio?: {
        enabled: boolean
        minSeconds: number
        maxSeconds: number
        maxCount: number
        maxTotalSeconds: number
        maxUploadBytes: number
        formats: string[]
        requiresVisualReference: boolean
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
  status?: 'processing' | 'completed' | 'failed'
  imageUrl?: string | null
  imageUrls?: string[] | null
  videoUrl?: string | null
  mediaType?: 'image' | 'video'
  creditsStatus?: string
  pollHintSeconds?: number | null
  success: boolean
  generationId?: string
  modelId?: string        // 后端返回实际使用的模型 ID(MCP 没传 modelId 时走 DB is_default)
  creditsUsed?: number
  deduped?: boolean
  error?: string
  failureCode?: string | null
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
  failureCode?: string | null
  generationId?: string
  requestId?: string
  modelId?: string
  creditsUsed?: number
  creditsStatus?: string
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
  async listModels(activeOnly = true, signal?: AbortSignal): Promise<MeiGenModel[]> {
    const params = new URLSearchParams()
    if (!activeOnly) params.set('active', 'false')

    return await withHttpResponse(`${this.baseUrl}/api/models?${params}`, {}, 15_000, async response => {
      const body = await boundedJson(response)
      if (!response.ok || body.success === false) throw responseError(response, body)
      return (Array.isArray(body.models) ? body.models : []) as MeiGenModel[]
    }, signal)
  }

  /** Get image details by ID (no auth required) */
  async getImageDetails(imageId: string, signal?: AbortSignal): Promise<MeiGenSearchResult | null> {
    return await withHttpResponse(`${this.baseUrl}/api/images/${encodeURIComponent(imageId)}`, { redirect: 'error' }, 8_000, async (response, requestSignal) => {
      if (response.status === 404) {
        void response.body?.cancel().catch(() => {})
        return null
      }
      const json = await boundedJson(response, 2 * 1024 * 1024, requestSignal)
      if (!response.ok) throw responseError(response, json)
      if (!json.success || !json.data || typeof json.data !== 'object' || Array.isArray(json.data)) return null
      return json.data as MeiGenSearchResult
    }, signal)
  }

  /** Generate an image (requires API token) */
  async generateImage(params: {
    prompt: string
    modelId?: string
    modelVariant?: string
    aspectRatio?: string
    resolution?: string
    quality?: string
    referenceImages?: string[]
    requestId?: string
    signal?: AbortSignal
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
    if (params.modelVariant) body.modelVariant = params.modelVariant
    if (params.resolution) {
      body.resolution = params.resolution
    }
    if (params.quality) {
      body.quality = params.quality
    }
    if (params.referenceImages && params.referenceImages.length > 0) {
      body.referenceImages = params.referenceImages
    }

    return await this.submitWithAttemptKey(body, params.requestId, params.signal)
  }

  /**
   * Submit with the caller-owned UUID. The backend persists input identity and task recovery.
   * Omission represents a new interactive attempt; composed workflows always provide their saved UUID.
   */
  private async submitWithAttemptKey(body: Record<string, unknown>, requestId: string = randomUUID(), signal?: AbortSignal): Promise<MeiGenGenerationResponse> {
    // Explicit workflow identity, never inferred from matching prompt parameters.
    await sharedApiSemaphore.acquire(signal)
    try {
      return await withHttpResponse(`${this.baseUrl}/api/generate/v2`, {
        method: 'POST', headers: { Authorization: `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, idempotencyKey: requestId }),
      }, 90_000, async response => {
        const json = await boundedJson(response)
        if (!response.ok || !json.success) throw responseError(response, json)
        if (typeof json.generationId !== 'string' || !json.generationId) throw new GenerationError('Submission response is missing generationId. Query this requestId before recovering.', 'invalid_response', 502, true)
        return json as unknown as MeiGenGenerationResponse
      }, signal)
    } finally { sharedApiSemaphore.release() }
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
    frameReferenceImages?: string[]
    contentReferenceImages?: string[]
    strictReferenceRoles?: boolean
    referenceVideo?: string           // deprecated single-clip alias; still sent verbatim when it is the only clip
    referenceVideos?: string[]        // Seedance 2.x 参考视频 URL 数组(images.meigen.ai)
    referenceAudios?: string[]        // Seedance 2.x 参考音频 URL 数组(images.meigen.ai;不计费)
    referenceVideoDuration?: number   // deprecated compatibility input; never sent (server probes MP4)
    requestId?: string
    signal?: AbortSignal
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
    if (params.contentReferenceImages !== undefined) {
      body.frameReferenceImages = params.frameReferenceImages ?? []
      body.contentReferenceImages = params.contentReferenceImages
      body.strictReferenceRoles = true
    }
    if (params.referenceVideo) body.referenceVideo = params.referenceVideo
    // Appended AFTER the legacy key so a legacy-shaped request serializes byte-identically
    // and keeps hitting the same server-side idempotency record.
    if (params.referenceVideos?.length) body.referenceVideos = params.referenceVideos
    if (params.referenceAudios?.length) body.referenceAudios = params.referenceAudios
    // Never send client-reported clip duration: it must not affect request identity or billing.

    return await this.submitWithAttemptKey(body, params.requestId, params.signal)
  }

  /** Check generation status by ID (no auth required) */
  async getGenerationStatus(generationId: string, signal?: AbortSignal): Promise<MeiGenGenerationStatus> {
    return this.readGeneration(`/api/generate/v2/status/${encodeURIComponent(generationId)}`, signal)
  }

  /** Caller request identity can recover an accepted job even after a lost POST response or another host. */
  async getGenerationByRequestId(requestId: string, signal?: AbortSignal): Promise<MeiGenGenerationStatus> {
    if (!this.apiToken) throw new GenerationError('MEIGEN_API_TOKEN is required to query requestId.', 'authentication_required', 401)
    return this.readGeneration(`/api/generate/v2/requests/${encodeURIComponent(requestId)}`, signal, true)
  }

  private async readGeneration(path: string, signal?: AbortSignal, requestLookup = false): Promise<MeiGenGenerationStatus> {
    return withHttpResponse(`${this.baseUrl}${path}`, this.apiToken ? { headers: { Authorization: `Bearer ${this.apiToken}` } } : {}, 15_000, async response => {
      // A missing route (including an HTML gateway response) is not proof that a
      // previously charged request is absent. Only the recovery API's own code is.
      const unavailable = () => new GenerationError('The request-recovery endpoint returned an unrecognized 404. Verify the API URL and matching backend deployment; keep this requestId and do not automatically resubmit.', 'endpoint_unavailable', 502)
      let json: Record<string, unknown>
      try { json = await boundedJson(response) }
      catch (error) {
        abortReason(signal)
        if (requestLookup && response.status === 404) throw unavailable()
        throw error
      }
      if (requestLookup && response.status === 404 && (json.success !== false || json.code !== 'request_not_found')) throw unavailable()
      if (!response.ok || json.success === false) throw responseError(response, json)
      if (!['processing', 'completed', 'failed'].includes(String(json.status))) throw new GenerationError('Status response is incomplete. Keep the same requestId and query again.', 'invalid_response', 502, true)
      return json as unknown as MeiGenGenerationStatus
    }, signal)
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
    signal?: AbortSignal,
  ): Promise<MeiGenGenerationStatus> {
    abortReason(signal)
    const startTime = Date.now()
    const deadline = startTime + safetyValveMs
    const pollInterval = 3_000
    const maxConsecutiveErrors = 3
    let consecutiveErrors = 0
    let lastProgress = 0
    const interrupted = () => new GenerationError(`Stopped waiting for generation ${generationId}; keep its IDs and use check_generation.`, 'polling_interrupted', 504, true)
    const controller = new AbortController()
    const abort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => controller.abort(interrupted()), Math.max(0, safetyValveMs))
    try {
      while (Date.now() < deadline) {
        let status: MeiGenGenerationStatus
        try {
          status = await this.getGenerationStatus(generationId, controller.signal)
          abortReason(controller.signal)
          consecutiveErrors = 0
        } catch (error) {
          abortReason(controller.signal)
          const transient = error instanceof GenerationError
            ? error.retryable && (error.httpStatus === 408 || error.httpStatus === 429 || error.httpStatus >= 500)
            : error instanceof TypeError
          if (!transient || ++consecutiveErrors >= maxConsecutiveErrors) throw error
          const retryAfter = error instanceof GenerationError ? error.details.retryAfterSeconds : undefined
          const delay = Math.max(pollInterval * 2 ** (consecutiveErrors - 1), typeof retryAfter === 'number' && Number.isFinite(retryAfter) ? retryAfter * 1000 : 0)
          await abortableDelay(Math.min(delay, Math.max(0, deadline - Date.now())), controller.signal)
          continue
        }

        if (status.status === 'completed' || status.status === 'failed') {
          return status
        }

        // Server-authoritative stop: observation window exhausted (orphan refund has
        // landed or is imminent) — no point waiting further.
        if (typeof status.pollHintSeconds === 'number' && status.pollHintSeconds <= 0) {
          return status
        }

        const elapsed = Date.now() - startTime
        if (onProgress && elapsed - lastProgress >= 15_000) {
          await onProgress(elapsed)
          lastProgress = elapsed
        }

        await abortableDelay(Math.min(pollInterval, Math.max(0, deadline - Date.now())), controller.signal)
      }
      throw interrupted()
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
  }
}
