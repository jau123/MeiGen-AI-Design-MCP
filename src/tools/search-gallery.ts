/**
 * search_gallery Tool — free, no auth required
 * Semantic search via website API (vector + keyword hybrid), with local fallback
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { MeiGenConfig } from '../config.js'
import {
  searchPrompts,
  getRandomPrompts,
  getLibraryStats,
} from '../lib/prompt-library.js'
import { apiSearchPosts, type ApiSearchResult } from '../lib/api-search.js'

export const searchGallerySchema = {
  query: z.string().optional()
    .describe('Search keywords (e.g., "cyberpunk", "product photo", "portrait"). Supports semantic search — natural language descriptions work well. Leave empty to browse by category or get random picks.'),
  category: z.enum(['3D', 'App', 'Food', 'Girl', 'JSON', 'Other', 'Photograph', 'Product']).optional()
    .describe('Filter by category. Available: 3D, App, Food, Girl, JSON, Other, Photograph, Product'),
  limit: z.number().min(1).max(20).optional().default(5)
    .describe('Number of results (1-20, default 5)'),
  offset: z.number().min(0).optional().default(0)
    .describe('Pagination offset'),
  sortBy: z.enum(['rank', 'likes', 'views', 'date']).optional().default('rank')
    .describe('Sort order when browsing without search query (default: rank)'),
}

export function registerSearchGallery(server: McpServer, config: MeiGenConfig) {
  server.tool(
    'search_gallery',
    'Search AI image prompts with semantic understanding — finds visually and conceptually similar results, not just keyword matches. Results include image URLs — render them as markdown images (![](url)) so users can visually browse and pick styles. Use when users need inspiration, want to explore styles, or say "generate an image" without a specific idea.',
    searchGallerySchema,
    { readOnlyHint: true },
    async ({ query, category, limit, offset, sortBy }) => {
      // No search criteria — return random picks from local library
      if (!query && !category && offset === 0) {
        const random = getRandomPrompts(limit)
        const stats = getLibraryStats()
        const header = `Curated Prompt Library: ${stats.total} trending prompts\nCategories: ${Object.entries(stats.categories).map(([k, v]) => `${k} (${v})`).join(', ')}\n\nHere are ${limit} random picks — show the preview images to the user:\n`
        return {
          content: [{
            type: 'text' as const,
            text: header + formatLocalResults(random),
          }],
        }
      }

      // Has query and no category filter → try semantic search via API
      if (query && query.trim() && !category) {
        const apiResults = await apiSearchPosts(config.meigenBaseUrl, query, limit, offset)
        if (apiResults && apiResults.length > 0) {
          const text = `Found ${apiResults.length} results for "${query}" (semantic search):\n\n${formatApiResults(apiResults)}\n\nShow the preview images above to the user so they can visually browse. Use get_inspiration(imageId) to get the full prompt and all images for any entry the user likes.`
          return {
            content: [{
              type: 'text' as const,
              text,
            }],
          }
        }
        // API failed or no results — fall through to local search
      }

      // Local search (keyword-based): with category filter, or as API fallback
      const results = searchPrompts({ query, category, limit, offset, sortBy })

      if (results.length === 0) {
        const suggestion = category
          ? `No results for "${query || ''}" in category "${category}". Try a different keyword or remove the category filter.`
          : `No results for "${query}". Try broader keywords like "portrait", "landscape", "product", "anime".`
        return {
          content: [{
            type: 'text' as const,
            text: suggestion,
          }],
        }
      }

      const searchDesc = [
        query ? `"${query}"` : null,
        category ? `category: ${category}` : null,
      ].filter(Boolean).join(', ')

      const text = `Found ${results.length} results${searchDesc ? ` for ${searchDesc}` : ''}:\n\n${formatLocalResults(results)}\n\nShow the preview images above to the user so they can visually browse. Use get_inspiration(imageId) to get the full prompt and all images for any entry the user likes.`

      return {
        content: [{
          type: 'text' as const,
          text,
        }],
      }
    }
  )
}

function formatApiResults(results: ApiSearchResult[]): string {
  return results.map((item, i) => {
    // Use text field as prompt, truncate for preview
    const promptText = item.text || ''
    const promptPreview = promptText.length > 150
      ? promptText.slice(0, 150).replace(/\n/g, ' ') + '...'
      : promptText.replace(/\n/g, ' ')

    const imageUrl = item.thumbnail_url || (item.media_urls?.[0])
    const author = item.author_display_name || item.author_username || 'Unknown'
    const model = item.model || 'unknown'

    const parts = [
      `${i + 1}. by ${author} — ${model}`,
      imageUrl ? `   ![Preview](${imageUrl})` : null,
      `   Prompt: ${promptPreview}`,
      `   Stats: ${item.likes} likes, ${item.views.toLocaleString()} views`,
      `   ID: ${item.id}`,
    ].filter(Boolean)
    return parts.join('\n')
  }).join('\n\n')
}

function formatLocalResults(results: ReturnType<typeof searchPrompts>): string {
  return results.map((item, i) => {
    // Truncate prompt to first 150 chars for preview
    const promptPreview = item.prompt.length > 150
      ? item.prompt.slice(0, 150).replace(/\n/g, ' ') + '...'
      : item.prompt.replace(/\n/g, ' ')

    const parts = [
      `${i + 1}. **#${item.rank}** by ${item.author_name} — ${item.categories.join(', ')}`,
      `   ![Preview #${item.rank}](${item.image})`,
      `   Prompt: ${promptPreview}`,
      `   Stats: ${item.likes} likes, ${item.views.toLocaleString()} views`,
      `   ID: ${item.id}`,
    ]
    return parts.join('\n')
  }).join('\n\n')
}
