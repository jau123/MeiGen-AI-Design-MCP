/**
 * manage_preferences Tool — read/write user preferences
 *
 * Single tool with action parameter to keep context footprint small (~600 tokens).
 * Storage: ~/.config/meigen/preferences.json (separate from provider config).
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  loadPreferences,
  updateDefaults,
  addFavorite,
  removeFavorite,
} from '../lib/preferences.js'

export const managePreferencesSchema = {
  action: z.enum(['get', 'set', 'add_favorite', 'remove_favorite'])
    .describe('Action to perform: "get" reads all preferences, "set" updates defaults/styleNotes, "add_favorite" saves a prompt, "remove_favorite" removes by index'),

  // For 'set' action
  style: z.string().optional()
    .describe('set: preferred default style (e.g. "realistic", "anime", "illustration")'),
  aspectRatio: z.string().optional()
    .describe('set: preferred default aspect ratio. Use "auto" (recommended) to let MeiGen infer per-prompt, or pin a value like "16:9", "1:1", "9:16".'),
  model: z.string().optional()
    .describe('set: preferred default model name'),
  provider: z.enum(['openai', 'meigen', 'comfyui']).optional()
    .describe('set: preferred default provider'),
  styleNotes: z.string().optional()
    .describe('set: free-text style notes (e.g. "cinematic lighting, shallow DOF, brand colors #1A1A2E")'),

  // For 'add_favorite' action
  prompt: z.string().optional()
    .describe('add_favorite: the prompt text to save'),

  // For 'remove_favorite' action
  index: z.number().optional()
    .describe('remove_favorite: 0-based index of the favorite to remove'),
}

export function registerManagePreferences(server: McpServer) {
  server.tool(
    'manage_preferences',
    'Read or update user preferences: default style, aspect ratio, model, style notes, and favorite prompts. Call with action "get" at conversation start to load preferences.',
    managePreferencesSchema,
    { readOnlyHint: false },
    async ({ action, style, aspectRatio, model, provider, styleNotes, prompt, index }) => {
      switch (action) {
        case 'get': {
          const prefs = loadPreferences()
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(prefs, null, 2),
            }],
          }
        }

        case 'set': {
          const updates: Record<string, string | undefined> = {}
          if (style !== undefined) updates.style = style
          if (aspectRatio !== undefined) updates.aspectRatio = aspectRatio
          if (model !== undefined) updates.model = model
          if (provider !== undefined) updates.provider = provider

          const prefs = updateDefaults(updates, styleNotes)
          return {
            content: [{
              type: 'text' as const,
              text: `Preferences updated.\n${JSON.stringify(prefs.defaults, null, 2)}` +
                (styleNotes !== undefined ? `\nStyle notes: ${prefs.styleNotes}` : ''),
            }],
          }
        }

        case 'add_favorite': {
          if (!prompt) {
            return {
              content: [{ type: 'text' as const, text: 'Missing "prompt" parameter for add_favorite action.' }],
              isError: true,
            }
          }
          const prefs = addFavorite({ prompt, model, aspectRatio })
          return {
            content: [{
              type: 'text' as const,
              text: `Saved to favorites (${prefs.favorites.length} total).`,
            }],
          }
        }

        case 'remove_favorite': {
          if (index === undefined || index === null) {
            return {
              content: [{ type: 'text' as const, text: 'Missing "index" parameter for remove_favorite action.' }],
              isError: true,
            }
          }
          const prefs = removeFavorite(index)
          return {
            content: [{
              type: 'text' as const,
              text: `Favorite removed (${prefs.favorites.length} remaining).`,
            }],
          }
        }

        default:
          return {
            content: [{ type: 'text' as const, text: `Unknown action: ${action}` }],
            isError: true,
          }
      }
    }
  )
}
