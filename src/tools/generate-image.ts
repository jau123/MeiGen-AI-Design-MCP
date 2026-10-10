/**
 * generate_image Tool — requires authentication, two provider modes:
 * Mode A: MeiGen account -> calls MeiGen platform API
 * Mode B: User's own API key -> calls OpenAI-compatible API
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js'
import type { ServerRequest, ServerNotification } from '@modelcontextprotocol/sdk/types.js'
import type { MeiGenConfig, ProviderType } from '../config.js'
import { getDefaultProvider, getAvailableProviders } from '../config.js'
import type { MeiGenApiClient } from '../lib/meigen-api.js'
import { OpenAIProvider } from '../lib/providers/openai.js'
import { classifyError } from '../lib/generation-shared.js'
import { saveImageLocally } from '../lib/save-image.js'
import { addRecentGeneration } from '../lib/preferences.js'
import { generationControls, generationOutputSchema, generationResult, errorOutput, GenerationError } from '../lib/generation-contract.js'
import { runMeiGenGeneration } from '../lib/generation-operation.js'
import { fingerprintReferences, uploadReferences } from '../lib/generation-references.js'

// MCP 不再硬编码 MeiGen 默认模型。
// 用户不传 model 时,MeiGen 后端会按 DB is_default=true 的行决定,
// 响应里回传实际使用的 modelId,MCP 据此展示给用户。
// 好处: 后端切默认(比如 gpt-image-2 维护/恢复)不需要发 npm 版本。

/** Safe notification — silently ignores if client doesn't support logging */
async function notify(extra: RequestHandlerExtra<ServerRequest, ServerNotification>, message: string) {
  try {
    await extra.sendNotification({
      method: 'notifications/message',
      params: { level: 'info', logger: 'generate_image', data: message },
    })
  } catch {
    // Client doesn't support logging — ignore
  }
}

export const generateImageSchema = {
  ...generationControls,
  prompt: z.string().trim().min(1, 'Prompt cannot be empty').describe('The image generation prompt'),
  modelId: z.string().trim().min(1).optional().describe('Alias of model for portable workflow calls. If both are present they must match.'),
  modelVariant: z.string().optional().describe('Optional model variant from live list_models, such as a supported GPT Image 2.5 variant. Forwarded unchanged to MeiGen.'),
  model: z.string().trim().min(1).optional()
    .describe('Model name. For OpenAI-compatible providers: any model ID your endpoint supports. For MeiGen: use model IDs from list_models (e.g. "gpt-image-2", "grok-image" = xAI Grok Imagine Quality, 1K/2K, supports image-to-image, "nanobanana-2", "seedream-4.5", "flux2-klein").'),
  size: z.string().optional()
    .describe('Image size for OpenAI-compatible providers: "1024x1024", "1536x1024", "auto". MeiGen: use aspectRatio instead.'),
  aspectRatio: z.string().optional()
    .describe('Aspect ratio for MeiGen provider. Use "auto" (recommended, default when omitted) to let MeiGen infer the best ratio from the prompt content. Explicit values: "1:1", "3:4", "4:3", "16:9", "9:16", "21:9", "2:3", "3:2", "4:5", "5:4", etc. (model-dependent).'),
  resolution: z.string().optional()
    .describe('Resolution tier. MeiGen: "1K" / "2K" / "3K" / "4K" — each model supports a subset (list_models reports resolutions when applicable). OpenAI: not used (use size instead).'),
  quality: z.string().optional()
    .describe('Image quality. MeiGen gpt-image-2: "low" / "medium" / "high". OpenAI-compatible providers also accept "high".'),
  referenceImages: z.array(z.string()).optional()
    .describe('Image references for style/content guidance. Accepts direct public HTTPS URLs without credentials/fragments or accessible absolute local paths. Relative paths are rejected. Local PNG/JPEG/WebP/GIF references up to 32 MiB and 64 million pixels are fully decoded, stripped of metadata and prepared up to 4096px, preserving transparency. Sources: gallery URLs from search_gallery/get_inspiration, URLs from previous generate_image results, or local file paths.'),
  provider: z.enum(['openai', 'meigen']).optional()
    .describe('Which provider to use. Auto-detected from configuration if not specified.'),
  negativePrompt: z.string().optional()
    .describe('Negative prompt for OpenAI-compatible providers.'),
}

export function registerGenerateImage(server: McpServer, apiClient: MeiGenApiClient, config: MeiGenConfig) {
  server.registerTool(
    'generate_image', { description:
    'Generate an image using AI. Supports MeiGen platform or OpenAI-compatible APIs. Tip: get prompts from get_inspiration() or enhance_prompt(), and use gallery image URLs as referenceImages for style guidance. For Midjourney V8.1, an optional style reference can be passed by appending `--sref <code>` at the end of the prompt — only when the user provides a Midjourney style code (numeric or text). Do NOT pass URLs or local paths via --sref; for any image-based reference, use the referenceImages parameter instead.',
    inputSchema: generateImageSchema, outputSchema: generationOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: true } },
    async ({ prompt, model, modelId, modelVariant, size, aspectRatio, resolution, quality, referenceImages, provider: requestedProvider, negativePrompt, requestId, wait = true, download = true }, extra) => {
      if (model && modelId && model !== modelId) return generationResult(errorOutput(new GenerationError('model and modelId must match when both are provided.', 'model_alias_conflict')))
      model = model ?? modelId
      const availableProviders = getAvailableProviders(config)

      if (availableProviders.length === 0) return generationResult(errorOutput(new GenerationError('No generation provider configured. Set MEIGEN_API_TOKEN or your selected provider key privately in MCP configuration.', 'authentication_required', 401)))

      // Determine which provider to use
      let providerType: ProviderType
      if (requestedProvider) {
        if (!availableProviders.includes(requestedProvider)) return generationResult(errorOutput(new GenerationError(`Provider "${requestedProvider}" is not configured. Available: ${availableProviders.join(', ')}`, 'provider_unavailable')))

        providerType = requestedProvider
      } else {
        providerType = getDefaultProvider(config)!
      }

      try {
        if (providerType === 'meigen') {
          return generationResult(await runMeiGenGeneration('image', { prompt, modelId: model, modelVariant, aspectRatio, resolution, quality, referenceImages, requestId, wait, download }, apiClient, config, extra.signal, message => notify(extra, message)))
        }
        // These synchronous providers have no MeiGen job identity; reject unsupported orchestration before upload/API I/O.
        if (!wait || requestId) throw new GenerationError('requestId and wait=false are supported only by provider=meigen. This provider has no resumable MeiGen generation ID.', 'unsupported_execution_mode')
        const resolvedRefs = await uploadReferences(await fingerprintReferences(referenceImages ?? [], extra.signal), config, extra.signal)
        return await generateWithOpenAI(config, prompt, model, size, quality, resolvedRefs, download, extra.signal)
      } catch (error) {
        const result = errorOutput(error, { provider: providerType })
        if (result.error) result.error.message += ` ${classifyError(result.error.message, providerType)}`
        return generationResult(result)
      }

    }
  )
}

// ============================================================
// Provider-specific generation functions
// ============================================================

async function generateWithOpenAI(
  config: MeiGenConfig,
  prompt: string,
  model?: string,
  size?: string,
  quality?: string,
  referenceImages?: string[],
  download = true,
  signal?: AbortSignal,
) {
  const provider = new OpenAIProvider(config.openaiApiKey!, config.openaiBaseUrl, config.openaiModel)
  const result = await provider.generate({ prompt, model, size, quality, referenceImages, signal, download })

  const savedPath = download ? saveImageLocally(result.imageBase64, result.mimeType) : undefined

  addRecentGeneration({ prompt, provider: 'openai', model: model || config.openaiModel })

  const response = generationResult({ success: true, status: 'completed', provider: 'openai', mediaType: 'image', modelId: model || config.openaiModel, urls: result.imageUrl ? [result.imageUrl] : [], ...(result.imageUrl ? { imageUrl: result.imageUrl } : {}), ...(savedPath ? { savedPath } : {}) })
  return { ...response, ...(!savedPath && result.imageBase64 ? { content: [...response.content, { type: 'image' as const, data: result.imageBase64, mimeType: result.mimeType }] } : {}) }

}
