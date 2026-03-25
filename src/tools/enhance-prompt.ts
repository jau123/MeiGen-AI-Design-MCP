/**
 * enhance_prompt Tool — free, runs locally
 * Returns a system prompt for the host LLM to expand the user's prompt; no external API calls
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getSystemPrompt, type PromptStyle } from '../lib/prompts.js'

export const enhancePromptSchema = {
  prompt: z.string().describe('The simple prompt to enhance (e.g., "a cat in a garden")'),
  style: z.enum(['realistic', 'anime', 'illustration']).optional().default('realistic')
    .describe('Target visual style: realistic (photorealistic), anime (2D/Japanese), illustration (concept art). IMPORTANT: Use "anime" when the user intends to generate with Midjourney Niji 7 — the default "realistic" produces prompts poorly suited for anime models.'),
}

export function registerEnhancePrompt(server: McpServer) {
  server.tool(
    'enhance_prompt',
    'Transform a simple idea into a professional image generation prompt. Use when the user provides a brief description (e.g., "a cat in a garden") and needs a detailed, high-quality prompt. Combine with gallery inspiration for best results. Free, no API key needed.',
    enhancePromptSchema,
    { readOnlyHint: true },
    async ({ prompt, style }) => {
      const systemPrompt = getSystemPrompt(style as PromptStyle)

      return {
        content: [{
          type: 'text' as const,
          text: `Please enhance the following prompt using these guidelines:\n\n---\n${systemPrompt}\n---\n\nUser's prompt to enhance:\n"${prompt}"\n\nGenerate the enhanced prompt now. Then show it to the user and ask if they'd like to generate an image with it (call generate_image if they confirm).`,
        }],
      }
    }
  )
}
