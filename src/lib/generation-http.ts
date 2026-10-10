import { GenerationError } from './generation-contract.js'
import { open, rename, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

export function abortReason(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Request cancelled', 'AbortError')
}

export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  abortReason(signal)
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal?.reason ?? new DOMException('Request cancelled', 'AbortError')) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, ms)
    signal?.addEventListener('abort', abort, { once: true })
  })
}

/** Timeout covers headers AND body. Parent cancellation never leaves a queued request running. */
export async function withHttpResponse<T>(url: string, init: RequestInit, timeoutMs: number, consume: (response: Response, signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
  abortReason(signal)
  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => controller.abort(new GenerationError('HTTP request timed out. Keep the same requestId when recovering.', 'request_timeout', 504, true)), timeoutMs)
  try { return await consume(await fetch(url, { ...init, signal: controller.signal }), controller.signal) }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
}

/** Bounded chunked writes keep large videos out of memory. Only complete files are published. */
export async function streamResponseToFile(response: Response, path: string, maxBytes: number, signal?: AbortSignal): Promise<void> {
  abortReason(signal)
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel()
    throw new GenerationError('Response exceeds the download size limit.', 'download_too_large', 413)
  }
  if (!response.body) throw new GenerationError('Response body is missing.', 'invalid_response', 502, true)
  const temporary = `${path}.${randomUUID()}.part`
  const handle = await open(temporary, 'wx', 0o600)
  const reader = response.body.getReader()
  const abort = () => { void reader.cancel(signal?.reason).catch(() => {}) }
  signal?.addEventListener('abort', abort, { once: true })
  let total = 0
  let closed = false
  try {
    while (true) {
      abortReason(signal)
      const chunk = await reader.read()
      abortReason(signal)
      if (chunk.done) break
      total += chunk.value.byteLength
      if (total > maxBytes) throw new GenerationError('Response exceeds the download size limit.', 'download_too_large', 413)
      let offset = 0
      while (offset < chunk.value.byteLength) {
        abortReason(signal)
        const written = await handle.write(chunk.value, offset, chunk.value.byteLength - offset)
        if (!written.bytesWritten) throw new GenerationError('Could not write the downloaded result.', 'download_failed', 500)
        offset += written.bytesWritten
      }
    }
    if (total === 0) throw new GenerationError('Downloaded result body is empty.', 'invalid_response', 502, true)
    await handle.sync()
    await handle.close(); closed = true
    abortReason(signal)
    await rename(temporary, path)
  } finally {
    signal?.removeEventListener('abort', abort)
    void reader.cancel().catch(() => {}) // Do not let an unresponsive source delay local cleanup.
    reader.releaseLock()
    try { if (!closed) await handle.close() }
    finally { try { await unlink(temporary) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error } }
  }
}

export async function boundedBytes(response: Response, maxBytes: number, signal?: AbortSignal): Promise<Buffer> {
  abortReason(signal)
  const length = Number(response.headers.get('content-length'))
  if (length > maxBytes) { void response.body?.cancel().catch(() => {}); throw new GenerationError('Response exceeds the download size limit.', 'download_too_large', 413) }
  if (!response.body) throw new GenerationError('Response body is missing.', 'invalid_response', 502, true)
  const reader = response.body.getReader()
  const abort = () => { void reader.cancel(signal?.reason).catch(() => {}) }
  signal?.addEventListener('abort', abort, { once: true })
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      abortReason(signal)
      const chunk = await reader.read()
      abortReason(signal)
      if (chunk.done) break
      total += chunk.value.byteLength
      if (total > maxBytes) throw new GenerationError('Response exceeds the download size limit.', 'download_too_large', 413)
      chunks.push(chunk.value)
    }
    return Buffer.concat(chunks, total)
  } finally {
    signal?.removeEventListener('abort', abort)
    // Cleanup must not wait for a stalled upstream cancellation handler.
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export async function boundedJson(response: Response, maxBytes = 2 * 1024 * 1024, signal?: AbortSignal): Promise<Record<string, unknown>> {
  try {
    const value: unknown = JSON.parse((await boundedBytes(response, maxBytes, signal)).toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Not an object')
    return value as Record<string, unknown>
  } catch (error) {
    abortReason(signal)
    if (error instanceof GenerationError) throw error
    throw new GenerationError('API returned an incomplete or invalid response. Keep the same requestId.', 'invalid_response', 502, true)
  }
}

export function responseError(response: Response, body: Record<string, unknown>): GenerationError {
  const raw = response.headers.get('retry-after')
  const retryAfter = raw ? (/^\d+$/.test(raw) ? Number(raw) : Math.max(0, Math.ceil((Date.parse(raw) - Date.now()) / 1000))) : body.retryAfterSeconds
  return new GenerationError(typeof body.error === 'string' ? body.error : `API request failed (${response.status})`, typeof body.code === 'string' ? body.code : `http_${response.status}`, response.status,
    typeof body.retryable === 'boolean' ? body.retryable : response.status === 402 || response.status === 408 || response.status === 429 || response.status >= 500,
    { ...(typeof retryAfter === 'number' && Number.isFinite(retryAfter) ? { retryAfterSeconds: retryAfter } : {}), ...(typeof body.required === 'number' ? { required: body.required } : {}), ...(typeof body.available === 'number' ? { available: body.available } : {}) })
}
