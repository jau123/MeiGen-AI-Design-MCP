/**
 * Website API search client
 * Calls meigen.ai /api/search for semantic (vector + keyword hybrid) search
 * Reports errors explicitly; no bundled offline library is used
 */

export interface ApiSearchResult {
  id: string
  text: string
  thumbnail_url: string | null
  media_urls: string[] | null
  matched_media_index?: number | null
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
  snapshot_id?: string
  snapshot_expires_at?: number
  next_offset?: number | null
}

/** Distinguish account allowance, short network rate limits, and upstream unavailability. */
export type ApiSearchOutcome =
  | { kind: 'ok'; results: ApiSearchResult[]; snapshotId?: string; snapshotExpiresAt?: number; nextOffset: number | null; hasMore: boolean; paginationMode: 'snapshot' | 'offset' }
  | { kind: 'rate-limited' }
  /** 账户每日搜索额度用尽(带 key 才会出现):UTC 次日 00:00 才重置,不是一分钟后能好的事。 */
  | { kind: 'daily-limit' }
  | { kind: 'unavailable' }
  | { kind: 'snapshot-expired' }
  | { kind: 'snapshot-unavailable' }
  | { kind: 'cancelled' }

/**
 * Search posts via website API (semantic vector + keyword hybrid search).
 *
 * `apiToken` is optional: anonymous callers share the per-IP anti-scrape budget, while a
 * MeiGen API key makes the request countable against that account's own daily search quota
 * instead — which is what lets a single machine keep searching behind a shared NAT.
 */
export async function apiSearchPosts(
  baseUrl: string,
  query: string,
  limit: number,
  offset: number,
  apiToken?: string,
  snapshotId?: string,
  signal?: AbortSignal,
): Promise<ApiSearchOutcome> {
  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, 8000)
  try {
    signal?.throwIfAborted()
    const params = new URLSearchParams({
      q: query,
      type: 'posts',
      limit: String(limit),
      offset: String(offset),
      media: 'matched-v1',
    })
    if (offset === 0 || snapshotId) params.set('pagination', 'snapshot')
    if (snapshotId) params.set('snapshot', snapshotId)
    const url = `${baseUrl}/api/search?${params}`

    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'error',
      ...(apiToken ? { headers: { Authorization: `Bearer ${apiToken}` } } : {}),
    })
    signal?.throwIfAborted()

    if (res.status === 429) {
      // 两种 429 的处置完全不同:账户每日额度(code=DAILY_LIMIT_REACHED)vs 匿名 IP 限流。
      const code = await res.json().then(body => (body && typeof body === 'object' && 'code' in body ? String(body.code) : ''), () => '')
      signal?.throwIfAborted()
      return { kind: code === 'DAILY_LIMIT_REACHED' ? 'daily-limit' : 'rate-limited' }
    }
    if (res.status === 410) return { kind: 'snapshot-expired' }
    if (!res.ok) return { kind: snapshotId ? 'snapshot-unavailable' : 'unavailable' }

    const json = await res.json() as ApiSearchResponse
    signal?.throwIfAborted()
    if (!json.success || !Array.isArray(json.data)) return { kind: snapshotId ? 'snapshot-unavailable' : 'unavailable' }
    if (snapshotId && json.snapshot_id !== snapshotId) return { kind: 'snapshot-unavailable' }
    if (json.snapshot_id) {
      if (!(json.next_offset === null || (Number.isInteger(json.next_offset) && Number(json.next_offset) > offset))) {
        return { kind: 'snapshot-unavailable' }
      }
      const nextOffset = json.next_offset !== null && Number(json.next_offset) <= 100000 ? json.next_offset! : null
      return {
        kind: 'ok', results: json.data, snapshotId: json.snapshot_id,
        ...(typeof json.snapshot_expires_at === 'number' ? { snapshotExpiresAt: json.snapshot_expires_at } : {}),
        nextOffset, hasMore: nextOffset !== null, paginationMode: 'snapshot',
      }
    }
    const hasMore = json.data.length >= limit && offset + limit <= 100000
    return { kind: 'ok', results: json.data, nextOffset: hasMore ? offset + limit : null, hasMore, paginationMode: 'offset' }
  } catch {
    return { kind: signal?.aborted ? 'cancelled' : snapshotId ? 'snapshot-unavailable' : 'unavailable' }
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}
