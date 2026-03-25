/**
 * MeiGen API HTTP client
 * Used for MeiGen platform mode — calls the hosted generation API
 */

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
}

export interface MeiGenGenerationResponse {
  success: boolean
  generationId?: string
  error?: string
}

export interface MeiGenGenerationStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  imageUrl: string | null
  imageUrls: string[] | null
  error: string | null
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
    referenceImages?: string[]
  }): Promise<MeiGenGenerationResponse> {
    if (!this.apiToken) {
      throw new Error('MEIGEN_API_TOKEN is required for image generation via MeiGen')
    }

    const body: Record<string, unknown> = {
      prompt: params.prompt,
      modelId: params.modelId,
      aspectRatio: params.aspectRatio || '1:1',
      resolution: params.resolution || '2K',
    }
    if (params.referenceImages && params.referenceImages.length > 0) {
      body.referenceImages = params.referenceImages
    }

    const res = await fetch(`${this.baseUrl}/api/generate/v2`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const json = await res.json() as MeiGenGenerationResponse
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Generation failed: ${res.status}`)
    }

    return json
  }

  /** Check generation status by ID (no auth required) */
  async getGenerationStatus(generationId: string): Promise<MeiGenGenerationStatus> {
    const res = await fetch(
      `${this.baseUrl}/api/generate/v2/status/${encodeURIComponent(generationId)}`
    )

    if (!res.ok) {
      throw new Error(`Status check failed: ${res.status} ${res.statusText}`)
    }

    return await res.json() as MeiGenGenerationStatus
  }

  /** Poll generation status until completed or timed out */
  async waitForGeneration(
    generationId: string,
    timeoutMs = 300_000,
    onProgress?: (elapsedMs: number) => Promise<void>,
  ): Promise<MeiGenGenerationStatus> {
    const startTime = Date.now()
    const pollInterval = 3_000
    let lastProgress = 0

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getGenerationStatus(generationId)

      if (status.status === 'completed' || status.status === 'failed') {
        return status
      }

      const elapsed = Date.now() - startTime
      if (onProgress && elapsed - lastProgress >= 15_000) {
        await onProgress(elapsed)
        lastProgress = elapsed
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    throw new Error(`Generation timed out after ${timeoutMs / 1000}s`)
  }
}
