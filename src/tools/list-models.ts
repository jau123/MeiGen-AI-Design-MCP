/**
 * list_models Tool — free, no auth required
 * Lists all available AI image generation models and providers
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { MeiGenApiClient } from '../lib/meigen-api.js'
import type { MeiGenConfig } from '../config.js'
import { getAvailableProviders } from '../config.js'
import {
  listWorkflows,
  loadWorkflow,
  getWorkflowSummary,
  ComfyUIProvider,
} from '../lib/providers/comfyui.js'

export const listModelsSchema = {
  activeOnly: z.boolean().optional().default(true)
    .describe('Only show active models (default: true)'),
}

export function registerListModels(server: McpServer, apiClient: MeiGenApiClient, config: MeiGenConfig) {
  server.tool(
    'list_models',
    'List available AI image generation models and their capabilities. For up-to-date pricing, see https://www.meigen.ai/model-comparison.',
    listModelsSchema,
    { readOnlyHint: true },
    async ({ activeOnly }) => {
      const providers = getAvailableProviders(config)
      const sections: string[] = []

      // MeiGen platform models
      try {
        const allModels = await apiClient.listModels(activeOnly)
        // 过滤 hidden 模型(老版 V7 / Niji 7 / Seedance Pro 旧 row 等只为兼容老 MCP modelId 调用,不应在 list 里推荐)
        const visible = allModels.filter(m => m.extra_config?.hidden !== true)

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
          const durations = Array.isArray(cfg.durations) && cfg.durations.length > 0
            ? `${cfg.durations[0]}–${cfg.durations[cfg.durations.length - 1]}s`
            : (typeof cfg.defaultDuration === 'number' ? `fixed ${cfg.defaultDuration}s` : null)
          const tags = Array.isArray(cfg.tags) && cfg.tags.length > 0
            ? cfg.tags.join(', ')
            : null
          // Video pricing varies by model:
          //   - seedance / happyhorse: per-second (rate × duration, tier/resolution dependent)
          //   - veo: per-generation by tier × duration (resolution doesn't affect price)
          // credits_per_generation, when present, represents the floor / base cost for the shortest
          // typical clip. Show the field only when the backend exposes a usable number; otherwise
          // direct users to the live page for the full schedule.
          const cost = m.credits_per_generation > 0
            ? `from ${m.credits_per_generation} credits (variable pricing — see model-comparison for the full schedule)`
            : null
          return [
            `${i + 1}. ${m.name}`,
            `   ID: ${m.id}`,
            tags ? `   Status: ${tags}` : '',
            tiers ? `   Tiers: ${tiers}` : '',
            resolutions ? `   Resolutions: ${resolutions}` : '',
            tierResLine || '',
            durations ? `   Duration: ${durations}` : '',
            `   Ratios: ${m.supported_ratios.join(', ')}`,
            cost ? `   Cost: ${cost}` : '',
            cfg.supportsReferenceVideo ? `   Supports reference video continuation: yes (pass referenceVideo + referenceVideoDuration to generate_video)` : '',
            m.description ? `   Description: ${m.description}` : '',
          ].filter(Boolean).join('\n')
        }

        if (imageModels.length > 0) {
          sections.push(
            `## MeiGen Platform — Image Models${providers.includes('meigen') ? '' : ' (requires MEIGEN_API_TOKEN)'}\n\n` +
            `When generating, do NOT specify model unless the user explicitly asks for one.\n` +
            `The server uses the platform default automatically.\n` +
            `Pricing varies by model and changes over time — see https://www.meigen.ai/model-comparison\n\n` +
            imageModels.map(renderImage).join('\n\n')
          )
        }

        if (videoModels.length > 0) {
          sections.push(
            `## MeiGen Platform — Video Models${providers.includes('meigen') ? '' : ' (requires MEIGEN_API_TOKEN)'}\n\n` +
            `Use the \`generate_video\` tool to create videos. Pricing is per-second (see https://www.meigen.ai/model-comparison).\n\n` +
            videoModels.map(renderVideo).join('\n\n')
          )
        }

        if (imageModels.length === 0 && videoModels.length === 0) {
          sections.push('## MeiGen Platform Models\n\nNo models available.')
        }
      } catch {
        sections.push('## MeiGen Platform Models\n\nUnable to fetch models from MeiGen API.')
      }

      // ComfyUI local
      if (providers.includes('comfyui')) {
        const workflows = listWorkflows()
        const defaultName = config.comfyuiDefaultWorkflow || workflows[0]
        const comfyuiUrl = config.comfyuiUrl || 'http://localhost:8188'

        const workflowLines = workflows.map(name => {
          try {
            const wf = loadWorkflow(name)
            const s = getWorkflowSummary(wf)
            const isDefault = name === defaultName ? ' (default)' : ''
            const ckpt = s.checkpoint || 'unknown model'
            const params = [
              s.steps != null ? `${s.steps} steps` : null,
              s.cfg != null ? `CFG ${s.cfg}` : null,
              s.sampler || null,
              s.width && s.height ? `${s.width}×${s.height}` : null,
            ].filter(Boolean).join(', ')
            return `  - ${name}${isDefault}: ${ckpt} (${params})`
          } catch {
            return `  - ${name} (error reading workflow)`
          }
        })

        // Try to fetch available checkpoints (non-blocking)
        let checkpointInfo = ''
        try {
          const provider = new ComfyUIProvider(comfyuiUrl)
          const checkpoints = await provider.listCheckpoints()
          if (checkpoints.length > 0) {
            checkpointInfo = `\n   Available checkpoints: ${checkpoints.slice(0, 10).join(', ')}${checkpoints.length > 10 ? ` (+${checkpoints.length - 10} more)` : ''}`
          }
        } catch {
          // ComfyUI may not be running, skip
        }

        sections.push([
          '## ComfyUI (Local)',
          `   URL: ${comfyuiUrl}`,
          `   Workflows:\n${workflowLines.join('\n')}`,
          checkpointInfo,
          '   Use comfyui_workflow tool to view/modify workflow parameters.',
        ].filter(Boolean).join('\n'))
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

      if (providers.includes('atlascloud')) {
        sections.push([
          '## Atlas Cloud Media API',
          `   Default model: ${config.atlascloudModel}`,
          `   Base URL: ${config.atlascloudBaseUrl}`,
          '   Use provider="atlascloud" in generate_image. You can pass any Atlas Cloud image model ID via the model parameter.',
        ].join('\n'))
      }

      // Configuration status
      const configStatus = providers.length > 0
        ? `\nConfigured providers: ${providers.join(', ')}`
        : '\nNo image generation providers configured. On Claude Code, run /meigen:setup. On other hosts, set MEIGEN_API_TOKEN / ATLASCLOUD_API_KEY / OPENAI_API_KEY in your MCP config env block, or import a ComfyUI workflow.'

      return {
        content: [{
          type: 'text' as const,
          text: sections.join('\n\n') + configStatus,
        }],
      }
    }
  )
}
