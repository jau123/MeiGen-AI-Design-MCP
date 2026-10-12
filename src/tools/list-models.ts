/**
 * list_models Tool — free, no auth required
 * Lists all available AI image generation models and providers
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { MeiGenApiClient, MeiGenModel } from '../lib/meigen-api.js'
import { minimumVideoCredits, videoCapabilitiesForModel } from '../lib/video-capabilities.js'
import type { MeiGenConfig } from '../config.js'
import { getAvailableProviders } from '../config.js'

export const listModelsSchema = {
  activeOnly: z.boolean().optional().default(true)
    .describe('Only show active models (default: true)'),
}

export function registerListModels(server: McpServer, apiClient: MeiGenApiClient, config: MeiGenConfig) {
  server.registerTool(
    'list_models', { description:
    'List available AI image generation models and their capabilities. For up-to-date pricing, see https://www.meigen.ai/model-comparison.',
    inputSchema: listModelsSchema,
    outputSchema: { success: z.boolean(), models: z.array(z.object({ id: z.string(), name: z.string() }).passthrough()), configuredProviders: z.array(z.enum(['meigen','openai'])), executionCapabilities: z.object({ submitOnly: z.boolean(), download: z.boolean(), maxConcurrentSubmissions: z.number(), concurrency: z.string() }), error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).optional() },
    annotations: { readOnlyHint: true } },
    async ({ activeOnly }, extra) => {
      const providers = getAvailableProviders(config)
      const sections: string[] = []
      let models: MeiGenModel[] = []
      let modelError: { code: string; message: string; retryable: boolean } | undefined

      // MeiGen platform models
      try {
        const allModels = await apiClient.listModels(activeOnly, extra.signal)
        // 过滤 hidden 模型(老版 V7 / Niji 7 / Seedance Pro 旧 row 等只为兼容老 MCP modelId 调用,不应在 list 里推荐)
        const visible = allModels.filter(m => m.extra_config?.hidden !== true)
        models = visible

        const imageModels = visible.filter(m => (m.media_type ?? 'image') === 'image')
        const videoModels = visible.filter(m => m.media_type === 'video')

        const renderImage = (m: typeof imageModels[number], i: number) => {
          const cfg = m.extra_config || {}
          const resolutions = Array.isArray(cfg.resolutions) && cfg.resolutions.length > 0
            ? cfg.resolutions.join(', ')
            : null
          const qualities = Array.isArray(cfg.qualities) && cfg.qualities.length > 0
            ? cfg.qualities.join(', ')
            : null
          const tags = Array.isArray(cfg.tags) && cfg.tags.length > 0
            ? cfg.tags.join(', ')
            : null
          const cost = m.credits_per_generation > 0
            ? `${m.credits_per_generation} credit${m.credits_per_generation === 1 ? '' : 's'} / image`
            : null
          return [
            `${i + 1}. ${m.name}`,
            `   ID: ${m.id}`,
            tags ? `   Status: ${tags}` : '',
            resolutions ? `   Resolutions: ${resolutions}` : `   4K: ${m.supports_4k ? 'Yes' : 'No'}`,
            qualities ? `   Quality tiers: ${qualities}` : '',
            `   Ratios: ${m.supported_ratios.join(', ')}`,
            cost ? `   Cost: ${cost} (typical — see model-comparison for full schedule)` : '',
            m.description ? `   Description: ${m.description}` : '',
          ].filter(Boolean).join('\n')
        }

        const renderVideo = (m: typeof videoModels[number], i: number) => {
          const cfg = m.extra_config || {}
          const video = videoCapabilitiesForModel(m)
          const tiers = Array.isArray(cfg.tiers) && cfg.tiers.length > 0
            ? cfg.tiers.join(', ')
            : null
          // Merge model-level resolutions with per-tier resolutions so tier-only
          // capabilities (e.g. Seedance Pro's 4k) are never hidden — the model-level
          // `resolutions` field lags behind `tierResolutions`.
          const tierRes = cfg.tierResolutions && typeof cfg.tierResolutions === 'object'
            ? cfg.tierResolutions
            : null
          const resSet = new Set<string>()
          if (Array.isArray(cfg.resolutions)) cfg.resolutions.forEach(r => resSet.add(r))
          if (tierRes) Object.values(tierRes).forEach(list => Array.isArray(list) && list.forEach(r => resSet.add(r)))
          const resolutions = resSet.size > 0 ? Array.from(resSet).join(', ') : null
          const tierResLine = tierRes
            ? `   Resolutions by tier: ${Object.entries(tierRes).map(([t, list]) => `${t} ${Array.isArray(list) ? list.join('/') : ''}`.trim()).join(', ')}`
            : null
          const outputDuration = video.valid ? video.outputDuration : null
          const durations = outputDuration?.kind === 'enum'
            ? `${outputDuration.values.join(', ')}s (default ${outputDuration.default}s)`
            : outputDuration?.kind === 'range'
              ? `${outputDuration.min}–${outputDuration.max}s, step ${outputDuration.step}s (default ${outputDuration.default}s)`
              : null
          const requestDefault = video.billing?.requestDefaultSeconds
          const requestDefaultNote =
            outputDuration && requestDefault !== undefined && requestDefault !== outputDuration.default
              ? `; omitted-request default ${requestDefault}s`
              : ''
          const referenceVideo = video.valid ? video.referenceVideo : null
          const referenceResolutionDetail = referenceVideo?.resolutionsByTier
            ? Object.entries(referenceVideo.resolutionsByTier)
                .map(([tier, values]) => `${tier} ${values.join('/')}`)
                .join(', ')
            : referenceVideo?.resolutions?.join(', ')
          const referenceUploadLimit =
            typeof referenceVideo?.maxUploadBytes === 'number'
              ? `; upload ≤${Math.floor(referenceVideo.maxUploadBytes / 1024 / 1024)}MB`
              : ''
          const clips = (count: number) => `${count} clip${count === 1 ? '' : 's'}`
          const referenceAudio = video.valid ? video.referenceAudio : null
          const tags = Array.isArray(cfg.tags) && cfg.tags.length > 0
            ? cfg.tags.join(', ')
            : null
          const minimumCost = minimumVideoCredits(m, video)
          const cost = minimumCost !== null
            ? `minimum ${minimumCost} credits (variable pricing — see model-comparison for the full schedule)`
            : null
          const referenceBilling = video.billing?.referenceSeconds
          const referenceBillingNote = referenceBilling === 'output_only'
            ? 'Bill output seconds only; do not add input video or audio seconds.'
            : referenceBilling === 'reference_plus_output_with_minimum_table'
              ? `Sum server-measured input video seconds plus output and apply the minimum billable seconds table: ${JSON.stringify(cfg.minBillableTable ?? {})}; audio seconds are never added.`
              : referenceBilling === 'reference_plus_output'
                ? 'Sum server-measured input video seconds plus output; audio seconds are never added.'
                : 'Reference-video billing is not declared; do not infer a seconds formula. Check current capabilities before quoting.'
          return [
            `${i + 1}. ${m.name}`,
            `   ID: ${m.id}`,
            tags ? `   Status: ${tags}` : '',
            tiers ? `   Tiers: ${tiers}` : '',
            resolutions ? `   Resolutions: ${resolutions}` : '',
            tierResLine || '',
            durations ? `   Duration: ${durations}${requestDefaultNote}` : '',
            `   Ratios: ${m.supported_ratios.join(', ')}`,
            cost ? `   Cost: ${cost}` : '',
            m.capabilities?.characters ? `   Saved characters (remote OAuth only): ${JSON.stringify(m.capabilities.characters)}` : '',
            m.capabilities?.videoInputs ? `   Reference input modes: ${JSON.stringify(m.capabilities.videoInputs)}. Pass contentReferenceImages: [] for endpoint-only input.` : '',
            cfg.pricingPerSec ? `${cfg.automaticReferencePricing === true ? '   Automatic pricing: text/first-frame uses standard; any content image, saved character, video or audio uses reference. Omit tier; it is selected from inputs.' : '   Without reference video (text/images/audio)'} Credits per output second: ${JSON.stringify(cfg.pricingPerSec)}` : '',
            cfg.pricingPerSecWithVideo ? `   With reference video, credits per billable second: ${JSON.stringify(cfg.pricingPerSecWithVideo)}. ${referenceBillingNote}` : '',
            (cfg.pricingPerCall ?? cfg.pricing) ? `   Credits per call: ${JSON.stringify(cfg.pricingPerCall ?? cfg.pricing)}` : '',
            referenceVideo?.enabled
              ? `   Reference video: ${referenceVideo.minSeconds}–${referenceVideo.maxSeconds}s per clip; up to ${clips(referenceVideo.maxCount)}, ${referenceVideo.maxTotalSeconds}s total${referenceVideo.tiers ? `; tiers ${referenceVideo.tiers.join(', ')}` : ''}${referenceResolutionDetail ? `; resolutions ${referenceResolutionDetail}` : ''}${referenceUploadLimit} (server probes duration)`
              : '',
            referenceAudio?.enabled
              ? `   Reference audio: ${referenceAudio.minSeconds}–${referenceAudio.maxSeconds}s per clip; up to ${clips(referenceAudio.maxCount)}, ${referenceAudio.maxTotalSeconds}s total; ${referenceAudio.formats.join('/')}; ≤${Math.floor(referenceAudio.maxUploadBytes / 1024 / 1024)}MB each${referenceAudio.requiresVisualReference ? ' (requires at least one reference image or reference video)' : ''}; audio seconds are not billed`
              : '',
            video.valid && video.requiresFirstFrame ? '   First frame: Required' : '',
            !video.valid ? '   Video settings: temporarily unavailable' : '',
            m.description ? `   Description: ${m.description}` : '',
          ].filter(Boolean).join('\n')
        }

        if (imageModels.length > 0) {
          sections.push(
            `## MeiGen Platform — Image Models${providers.includes('meigen') ? '' : ' (legacy local calls require an existing key; new connections use remote OAuth)'}\n\n` +
            `Preserve an explicitly selected model from the caller or workflow; otherwise the server selects its default.\n` +
            `The server uses the platform default automatically.\n` +
            `Pricing varies by model and changes over time — see https://www.meigen.ai/model-comparison\n\n` +
            imageModels.map(renderImage).join('\n\n')
          )
        }

        if (videoModels.length > 0) {
          sections.push(
            `## MeiGen Platform — Video Models${providers.includes('meigen') ? '' : ' (legacy local calls require an existing key; new connections use remote OAuth)'}\n\n` +
            `Use the \`generate_video\` tool to create videos. Pricing varies by model, tier, resolution, and duration, and may be per-second or per-call (see https://www.meigen.ai/model-comparison).\n\n` +
            videoModels.map(renderVideo).join('\n\n')
          )
        }

        if (imageModels.length === 0 && videoModels.length === 0) {
          sections.push('## MeiGen Platform Models\n\nNo models available.')
        }
      } catch (error) {
        modelError = { code: 'models_unavailable', message: error instanceof Error ? error.message : 'Unable to fetch MeiGen models', retryable: true }
        sections.push('## MeiGen Platform Models\n\nUnable to fetch models from MeiGen API.')
      }

      // User's own API key models
      if (providers.includes('openai')) {
        sections.push([
          '## OpenAI-Compatible Provider (using your API key)',
          `   Default model: ${config.openaiModel}`,
          `   Base URL: ${config.openaiBaseUrl}`,
          '   You can specify any model supported by your provider via the model parameter in generate_image.',
        ].join('\n'))
      }

      // Configuration status
      const configStatus = providers.length > 0
        ? `\nConfigured providers: ${providers.join(', ')}`
        : '\nNo image generation providers configured. On Claude Code, run /meigen:setup. On other hosts, set MEIGEN_API_TOKEN / OPENAI_API_KEY in your MCP config env block.'

      const structuredContent = { success: !modelError, models, configuredProviders: providers, executionCapabilities: { submitOnly: true, download: true, maxConcurrentSubmissions: 4, concurrency: 'MeiGen: at most four in-flight submissions per MCP process. Polling and downloads do not occupy submission slots. This is not an account-wide limit or requests-per-minute quota; honor the backend Retry-After.' }, ...(modelError ? { error: modelError } : {}) }
      return {
        structuredContent,
        ...(modelError ? { isError: true } : {}),
        content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }, {
          type: 'text' as const,
          text: sections.join('\n\n') + configStatus,
        }],
      }
    }
  )
}
