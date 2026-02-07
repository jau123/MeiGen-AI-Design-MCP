/**
 * generate_image Tool — requires authentication, three provider modes:
 * Mode A: MeiGen account -> calls MeiGen platform API
 * Mode B: ComfyUI local -> submits workflow to local ComfyUI
 * Mode C: User's own API key -> calls OpenAI-compatible API
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js'
import type { ServerRequest, ServerNotification } from '@modelcontextprotocol/sdk/types.js'
import type { MeiGenConfig, ProviderType } from '../config.js'
import { getDefaultProvider, getAvailableProviders } from '../config.js'
import type { MeiGenApiClient } from '../lib/meigen-api.js'
import { OpenAIProvider } from '../lib/providers/openai.js'
import {
  ComfyUIProvider,
  loadWorkflow,
  listWorkflows,
  getWorkflowSummary,
  calculateSize,
} from '../lib/providers/comfyui.js'
import { Semaphore } from '../lib/semaphore.js'

// Concurrency control: ComfyUI serial (local GPU), API max 4 parallel
const apiSemaphore = new Semaphore(4)
const comfyuiSemaphore = new Semaphore(1)

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
  prompt: z.string().describe('The image generation prompt'),
  model: z.string().optional()
    .describe('Model name. For OpenAI-compatible: gpt-image-1.5, dall-e-3, etc. For MeiGen: use model IDs from list_models.'),
  size: z.string().optional()
    .describe('Image size for OpenAI-compatible providers: "1024x1024", "1536x1024", "auto". MeiGen/ComfyUI: use aspectRatio instead.'),
  aspectRatio: z.string().optional()
    .describe('Aspect ratio: "1:1", "3:4", "4:3", "16:9", "9:16". For MeiGen and ComfyUI providers.'),
  quality: z.string().optional()
    .describe('Image quality for OpenAI-compatible providers: "low", "medium", "high"'),
  referenceImages: z.array(z.string()).optional()
    .describe('Public image URLs (http/https) for style/content guidance. Sources: gallery image URLs from search_gallery/get_inspiration, Image URLs from previous generate_image results, or URLs from upload_reference_image. Local file paths are NOT supported — use upload_reference_image to convert local files to URLs first. Works with all providers: MeiGen, OpenAI (gpt-image-1.5), ComfyUI (requires LoadImage node in workflow).'),
  provider: z.enum(['openai', 'meigen', 'comfyui']).optional()
    .describe('Which provider to use. Auto-detected from configuration if not specified.'),
  workflow: z.string().optional()
    .describe('ComfyUI workflow name to use (from comfyui_workflow list). Uses default workflow if not specified.'),
  negativePrompt: z.string().optional()
    .describe('Negative prompt for ComfyUI generation. Overrides the workflow template\'s negative prompt.'),
}

export function registerGenerateImage(server: McpServer, apiClient: MeiGenApiClient, config: MeiGenConfig) {
  server.tool(
    'generate_image',
    'Generate an image using AI. Supports MeiGen platform, local ComfyUI, or OpenAI-compatible APIs. Tip: get prompts from get_inspiration() or enhance_prompt(), and use gallery image URLs as referenceImages for style guidance.',
    generateImageSchema,
    { readOnlyHint: false },
    async ({ prompt, model, size, aspectRatio, quality, referenceImages, provider: requestedProvider, workflow, negativePrompt }, extra) => {
      const availableProviders = getAvailableProviders(config)

      if (availableProviders.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No image generation providers configured.\n\nQuickest way to start:\n1. Get a MeiGen API token at https://www.meigen.ai (sign in → avatar → Settings → API Keys)\n2. Run /meigen:setup and paste your token\n\nOr configure one of:\n- MEIGEN_API_TOKEN: MeiGen platform (Nanobanana Pro, GPT image 1.5, Seedream 4.5)\n- OPENAI_API_KEY: OpenAI/compatible API (gpt-image-1.5, etc.)\n- Import a ComfyUI workflow for local GPU generation',
          }],
          isError: true,
        }
      }

      // Determine which provider to use
      let providerType: ProviderType
      if (requestedProvider) {
        if (!availableProviders.includes(requestedProvider)) {
          return {
            content: [{
              type: 'text' as const,
              text: `Provider "${requestedProvider}" is not configured. Available: ${availableProviders.join(', ')}`,
            }],
            isError: true,
          }
        }
        providerType = requestedProvider
      } else {
        providerType = getDefaultProvider(config)!
      }

      try {
        switch (providerType) {
          case 'openai': {
            await apiSemaphore.acquire()
            try {
              return await generateWithOpenAI(config, prompt, model, size, quality, referenceImages)
            } finally {
              apiSemaphore.release()
            }
          }
          case 'meigen': {
            await apiSemaphore.acquire()
            try {
              return await generateWithMeiGen(apiClient, prompt, model, aspectRatio, referenceImages, extra)
            } finally {
              apiSemaphore.release()
            }
          }
          case 'comfyui': {
            await comfyuiSemaphore.acquire()
            try {
              return await generateWithComfyUI(config, prompt, workflow, aspectRatio, negativePrompt, referenceImages, extra)
            } finally {
              comfyuiSemaphore.release()
            }
          }
          default:
            return {
              content: [{ type: 'text' as const, text: `Unknown provider: ${providerType}` }],
              isError: true,
            }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const guidance = classifyError(message)
        return {
          content: [{
            type: 'text' as const,
            text: `Image generation failed: ${message}\n\n${guidance}`,
          }],
          isError: true,
        }
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
) {
  const provider = new OpenAIProvider(config.openaiApiKey!, config.openaiBaseUrl, config.openaiModel)
  const result = await provider.generate({ prompt, model, size, quality, referenceImages })

  const refNote = referenceImages?.length
    ? `\nUsed ${referenceImages.length} reference image(s) for guidance.`
    : ''

  return {
    content: [
      {
        type: 'image' as const,
        data: result.imageBase64,
        mimeType: result.mimeType,
      },
      {
        type: 'text' as const,
        text: `Image generated successfully via OpenAI (${model || config.openaiModel}).${refNote}\n\nNote: OpenAI-generated images are returned as inline data and do not have a reusable URL.`,
      },
    ],
  }
}

async function generateWithMeiGen(
  apiClient: MeiGenApiClient,
  prompt: string,
  model: string | undefined,
  aspectRatio: string | undefined,
  referenceImages: string[] | undefined,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
) {
  // 1. Submit generation request
  const genResponse = await apiClient.generateImage({
    prompt,
    modelId: model,
    aspectRatio: aspectRatio || '1:1',
    referenceImages,
  })

  if (!genResponse.generationId) {
    throw new Error('No generation ID returned')
  }

  // Notify: generation submitted
  await notify(extra, 'Image generation submitted, waiting for result...')

  // 2. Poll until completed (with progress notifications)
  const status = await apiClient.waitForGeneration(
    genResponse.generationId,
    300_000,
    async (elapsedMs) => {
      await notify(extra, `Still generating... (${Math.round(elapsedMs / 1000)}s elapsed)`)
    },
  )

  if (status.status === 'failed') {
    throw new Error(status.error || 'Generation failed')
  }

  if (!status.imageUrl) {
    throw new Error('No image URL in completed generation')
  }

  // Download image and convert to base64 for inline display
  const imageRes = await fetch(status.imageUrl)
  if (!imageRes.ok) {
    throw new Error(`Failed to download generated image: ${imageRes.status}`)
  }
  const buffer = await imageRes.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  const mimeType = imageRes.headers.get('content-type') || 'image/jpeg'

  return {
    content: [
      {
        type: 'image' as const,
        data: base64,
        mimeType,
      },
      {
        type: 'text' as const,
        text: `Image generated via MeiGen (model: ${model || 'default'}).\nImage URL: ${status.imageUrl}\n\nYou can use this URL as referenceImages in follow-up generate_image() calls for variations or style transfer.`,
      },
    ],
  }
}

async function generateWithComfyUI(
  config: MeiGenConfig,
  prompt: string,
  workflow: string | undefined,
  aspectRatio: string | undefined,
  negativePrompt: string | undefined,
  referenceImages: string[] | undefined,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
) {
  // Determine workflow
  const workflows = listWorkflows()
  if (workflows.length === 0) {
    throw new Error('No ComfyUI workflows configured. Use comfyui_workflow import to add one, or run /meigen:setup.')
  }

  const workflowName = workflow || config.comfyuiDefaultWorkflow || workflows[0]
  const workflowData = loadWorkflow(workflowName)

  // Calculate dimensions (if aspectRatio specified)
  let width: number | undefined
  let height: number | undefined
  if (aspectRatio) {
    const summary = getWorkflowSummary(workflowData)
    if (summary.width && summary.height) {
      const newSize = calculateSize(aspectRatio, summary.width, summary.height)
      width = newSize.width
      height = newSize.height
    }
  }

  // Notify: generation submitted
  await notify(extra, `Submitting workflow "${workflowName}" to ComfyUI...`)

  const provider = new ComfyUIProvider(config.comfyuiUrl || 'http://localhost:8188')
  const result = await provider.generate(
    workflowData,
    prompt,
    { width, height, negativePrompt, referenceImages },
    async (elapsedMs) => {
      await notify(extra, `Still generating... (${Math.round(elapsedMs / 1000)}s elapsed)`)
    },
  )

  return {
    content: [
      {
        type: 'image' as const,
        data: result.imageBase64,
        mimeType: result.mimeType,
      },
      {
        type: 'text' as const,
        text: `Image generated via ComfyUI (workflow: ${workflowName}).${result.referenceImageWarning ? `\n\nWarning: ${result.referenceImageWarning}` : ''}\n\nNote: ComfyUI-generated images are returned as inline data and do not have a reusable URL.`,
      },
    ],
  }
}

// ============================================================
// Error Classification
// ============================================================

function classifyError(message: string): string {
  const lower = message.toLowerCase()

  if (lower.includes('safety') || lower.includes('policy') || lower.includes('flagged') || lower.includes('content'))
    return 'The prompt may have triggered a content safety filter. Try rephrasing the prompt to avoid sensitive content.'

  if (lower.includes('credit') || lower.includes('insufficient') || message.includes('402'))
    return 'Insufficient credits. Daily free credits refresh each day, or purchase more at meigen.ai.'

  if (lower.includes('timed out') || lower.includes('timeout'))
    return 'Generation timed out. This can happen during high demand. You can try again — it may succeed on retry.'

  if (lower.includes('model') && (lower.includes('invalid') || lower.includes('inactive')))
    return 'This model may be unavailable. Use list_models to check currently available models.'

  if (lower.includes('ratio') && lower.includes('not supported'))
    return 'This aspect ratio is not supported by the selected model. Use list_models to check supported ratios.'

  if (lower.includes('token') && (lower.includes('invalid') || lower.includes('expired')))
    return 'API token issue. Run /meigen:setup to reconfigure your token.'

  if (lower.includes('econnrefused') || lower.includes('fetch failed') || lower.includes('network'))
    return 'Network connection issue. Check your internet connection and try again.'

  if (lower.includes('comfyui') || lower.includes('node_errors'))
    return 'ComfyUI workflow error. Use comfyui_workflow view to inspect the workflow, or try a different one.'

  return 'You can try again, or use a different prompt/model.'
}
