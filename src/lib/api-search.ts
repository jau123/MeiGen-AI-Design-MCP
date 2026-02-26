/**
 * Website API search client
 * Calls meigen.ai /api/search for semantic (vector + keyword hybrid) search
 * Falls back gracefully — caller should handle errors and use local search
 */

export interface ApiSearchResult {
  id: string
  text: string
  thumbnail_url: string | null
  media_urls: string[] | null
  author_username: string | null
  author_display_name: string | null
  likes: number
  views: number
  model: string | null
  prompt_ready: boolean | null
  image_width: number | null
  image_height: number | null
  rank: number
}

interface ApiSearchResponse {
  success: boolean
  data?: ApiSearchResult[]
  error?: string
}

/**
 * Search posts via website API (semantic + keyword hybrid search)
 * @returns results array, or null if API call fails (caller should fallback to local)
 */
export async function apiSearchPosts(
  baseUrl: string,
  query: string,
  limit: number,
  offset: number,
): Promise<ApiSearchResult[] | null> {
  try {
    const params = new URLSearchParams({
      q: query,
      type: 'posts',
      limit: String(limit),
      offset: String(offset),
    })
    const url = `${baseUrl}/api/search?${params}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) return null

    const json = await res.json() as ApiSearchResponse
    if (!json.success || !json.data) return null

    return json.data
  } catch {
    return null
  }
}
