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
          return [
            `${i + 1}. ${m.name}`,
            `   ID: ${m.id}`,
            resolutions ? `   Resolutions: ${resolutions}` : `   4K: ${m.supports_4k ? 'Yes' : 'No'}`,
            qualities ? `   Quality tiers: ${qualities}` : '',
            `   Ratios: ${m.supported_ratios.join(', ')}`,
            m.description ? `   Description: ${m.description}` : '',
          ].filter(Boolean).join('\n')
        }

        const renderVideo = (m: typeof videoModels[number], i: number) => {
          const cfg = m.extra_config || {}
          const tiers = Array.isArray(cfg.tiers) && cfg.tiers.length > 0
            ? cfg.tiers.join(', ')
            : null
          const resolutions = Array.isArray(cfg.resolutions) && cfg.resolutions.length > 0
            ? cfg.resolutions.join(', ')
            : null
          const durations = Array.isArray(cfg.durations) && cfg.durations.length > 0
            ? `${cfg.durations[0]}–${cfg.durations[cfg.durations.length - 1]}s`
            : (typeof cfg.defaultDuration === 'number' ? `fixed ${cfg.defaultDuration}s` : null)
          return [
            `${i + 1}. ${m.name}`,
            `   ID: ${m.id}`,
            tiers ? `   Tiers: ${tiers}` : '',
            resolutions ? `   Resolutions: ${resolutions}` : '',
            durations ? `   Duration: ${durations}` : '',
            `   Ratios: ${m.supported_ratios.join(', ')}`,
            cfg.supportsReferenceVideo ? `   Supports reference video continuation: yes (web only — MCP not supported)` : '',
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

      // Configuration status
      const configStatus = providers.length > 0
        ? `\nConfigured providers: ${providers.join(', ')}`
        : '\nNo image generation providers configured. Run /meigen:setup or set MEIGEN_API_TOKEN / OPENAI_API_KEY / import a ComfyUI workflow to enable generate_image.'

      return {
        content: [{
          type: 'text' as const,
          text: sections.join('\n\n') + configStatus,
        }],
      }
    }
  )
}
