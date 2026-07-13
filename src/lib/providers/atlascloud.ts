/**
 * Atlas Cloud Media API provider.
 * Atlas image generation is asynchronous: submit a task, then poll prediction status.
 */

import type { ImageGenerationRequest, ImageGenerationResult, ImageProvider } from './types.js'

interface AtlasGenerateResponse {
  code?: number
  data?: {
    id?: string
    prediction_id?: string
    status?: string
  }
  message?: string
  error?: string
}

interface AtlasPredictionResponse {
  code?: number
  data?: {
    status?: string
    outputs?: string[]
    output?: string[] | string
    images?: string[]
    image_url?: string
    error?: string
  }
  message?: string
  error?: string
}

export class AtlasCloudProvider implements ImageProvider {
  name = 'atlascloud'

  private apiKey: string
  private baseUrl: string
  private defaultModel: string

  constructor(apiKey: string, baseUrl: string, defaultModel: string) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.defaultModel = defaultModel
  }

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const model = request.model || this.defaultModel
    const predictionId = await this.submitGeneration(model, request)
    const imageUrl = await this.pollPrediction(predictionId)

    const imageRes = await fetch(imageUrl)
    if (!imageRes.ok) {
      throw new Error(`Failed to download Atlas Cloud image: ${imageRes.status}`)
    }

    const buffer = await imageRes.arrayBuffer()
    return {
      imageBase64: Buffer.from(buffer).toString('base64'),
      mimeType: imageRes.headers.get('content-type') || 'image/png',
    }
  }

  private async submitGeneration(model: string, request: ImageGenerationRequest): Promise<string> {
    const body: Record<string, unknown> = {
      model,
      prompt: request.prompt,
    }

    if (request.size) body.image_size = request.size
    if (request.aspectRatio) body.aspect_ratio = request.aspectRatio
    if (request.quality) body.quality = request.quality
    if (request.n) body.num_images = request.n
    if (request.referenceImages?.[0]) body.image_url = request.referenceImages[0]

    const res = await fetch(`${this.baseUrl}/model/generateImage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const json = await res.json().catch(() => ({})) as AtlasGenerateResponse
    if (!res.ok || (json.code && json.code !== 200)) {
      throw new Error(json.message || json.error || `Atlas Cloud API error ${res.status}`)
    }

    const id = json.data?.id || json.data?.prediction_id
    if (!id) {
      throw new Error('Atlas Cloud response did not include a prediction id')
    }
    return id
  }

  private async pollPrediction(predictionId: string): Promise<string> {
    const deadline = Date.now() + 300_000

    while (Date.now() < deadline) {
      const res = await fetch(`${this.baseUrl}/model/prediction/${predictionId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      })
      const json = await res.json().catch(() => ({})) as AtlasPredictionResponse

      if (!res.ok || (json.code && json.code !== 200)) {
        throw new Error(json.message || json.error || `Atlas Cloud prediction error ${res.status}`)
      }

      const status = json.data?.status?.toLowerCase()
      if (status === 'failed') {
        throw new Error(json.data?.error || 'Atlas Cloud generation failed')
      }

      if (status === 'completed' || status === 'succeeded') {
        const output = json.data?.output
        const outputs = json.data?.outputs
          || json.data?.images
          || (Array.isArray(output) ? output : output ? [output] : undefined)
          || (json.data?.image_url ? [json.data.image_url] : undefined)

        const first = outputs?.[0]
        if (!first) {
          throw new Error('Atlas Cloud prediction completed without an image URL')
        }
        return first
      }

      await new Promise(resolve => setTimeout(resolve, 3000))
    }

    throw new Error('Atlas Cloud generation timed out')
  }
}
