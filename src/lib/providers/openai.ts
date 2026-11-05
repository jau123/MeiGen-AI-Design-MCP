/**
 * OpenAI-compatible Provider
 * Works with any OpenAI-compatible `/v1/images/generations` endpoint — user supplies key, base URL, and model name.
 */

import { Semaphore } from '../semaphore.js'
const submissionSemaphore = new Semaphore(4)

import { withHttpResponse, boundedJson, boundedBytes, responseError } from '../generation-http.js'
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

    // Some models (e.g., DALL-E) require explicit response_format for base64 output.
    // Most OpenAI-compatible APIs return base64 by default — only add when needed.
    if (model.startsWith('dall-e')) {
      body.response_format = 'b64_json'
    }

    if (this.baseUrl === 'https://api.openai.com' && /^gpt-image-2(?:$|[.-])/.test(model)) {
      body.moderation = 'low'
    }
    if (request.quality) {
      body.quality = request.quality
    }

    // Pass reference images if provided. Most OpenAI-compatible models that
    // support image input accept an `image` array in the request body.
    // Known exception: DALL-E series does not support image input.
    if (request.referenceImages?.length && !model.startsWith('dall-e')) {
      body.image = request.referenceImages
    }

    await submissionSemaphore.acquire(request.signal)
    let json: OpenAIImageResponse
    try { json = await withHttpResponse(`${this.baseUrl}/v1/images/generations`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }, 300_000, async response => {
      const payload = await boundedJson(response, 90 * 1024 * 1024)
      if (!response.ok) throw responseError(response, payload)
      return payload as unknown as OpenAIImageResponse
    }, request.signal) } finally { submissionSemaphore.release() }

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
      if (request.download === false) return { imageBase64: '', mimeType: 'image/png', imageUrl: imageData.url }
      return await withHttpResponse(imageData.url, { redirect: 'error' }, 30_000, async response => {
        if (!response.ok) throw new Error(`Image download failed (${response.status})`)
        return { imageBase64: (await boundedBytes(response, 64 * 1024 * 1024)).toString('base64'), mimeType: response.headers.get('content-type') || 'image/png', imageUrl: imageData.url }
      }, request.signal)
    }

    throw new Error('Response contains neither b64_json nor url')
  }
}
