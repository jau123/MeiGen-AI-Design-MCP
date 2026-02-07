/**
 * OpenAI-compatible Provider
 * Supports gpt-image-1.5, DALL-E 3, and any OpenAI-compatible service (Together AI, DeepInfra, etc.)
 */

import type { ImageProvider, ImageGenerationRequest, ImageGenerationResult } from './types.js'

interface OpenAIImageResponse {
  data: Array<{
    b64_json?: string
    url?: string
  }>
}

export class OpenAIProvider implements ImageProvider {
  name = 'openai'

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

    const body: Record<string, unknown> = {
      model,
      prompt: request.prompt,
      n: request.n || 1,
      size: request.size || '1024x1024',
    }

    // gpt-image series returns base64 by default, no need for response_format
    // DALL-E series requires explicit response_format
    if (model.startsWith('dall-e')) {
      body.response_format = 'b64_json'
    }

    if (request.quality) {
      body.quality = request.quality
    }

    // gpt-image-1.5 supports reference images via the image parameter
    // DALL-E series does not support image input in the generations endpoint
    if (request.referenceImages?.length && !model.startsWith('dall-e')) {
      body.image = request.referenceImages
    }

    const res = await fetch(`${this.baseUrl}/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`OpenAI API error ${res.status}: ${errorText}`)
    }

    const json = await res.json() as OpenAIImageResponse

    const imageData = json.data?.[0]
    if (!imageData) {
      throw new Error('No image data in response')
    }

    if (imageData.b64_json) {
      return {
        imageBase64: imageData.b64_json,
        mimeType: 'image/png',
      }
    }

    // If response contains a URL, download and convert to base64
    if (imageData.url) {
      const imageRes = await fetch(imageData.url)
      const buffer = await imageRes.arrayBuffer()
      return {
        imageBase64: Buffer.from(buffer).toString('base64'),
        mimeType: imageRes.headers.get('content-type') || 'image/png',
      }
    }

    throw new Error('Response contains neither b64_json nor url')
  }
}
