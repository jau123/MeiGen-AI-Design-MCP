import { open, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { basename, extname } from 'node:path'
import type { MeiGenConfig } from '../config.js'
import { GenerationError } from './generation-contract.js'
import { unsafeReferenceUrlReason } from './url-safety.js'
import { processAndUploadReferenceBuffer, uploadReferenceMedia } from './upload.js'
import { abortReason } from './generation-http.js'
import { Semaphore } from './semaphore.js'

type Reference = { identity: string; url: string } | { identity: string; path: string; size: number; name: string }
export const MAX_LOCAL_REFERENCE_BYTES = 256 * 1024 * 1024
export function localReferenceBudget() {
  let total = 0
  return { reserve(size: number) {
    total += size
    if (total > MAX_LOCAL_REFERENCE_BYTES) throw new GenerationError('Local references exceed the 256 MiB combined request limit. Use smaller files or already prepared MeiGen URLs.', 'invalid_reference')
  } }
}
type ReferenceBudget = ReturnType<typeof localReferenceBudget>
export function publicReferenceUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port || unsafeReferenceUrlReason(value)) throw new Error('unsafe')
    return url.toString()
  } catch { throw new GenerationError('Use a direct public HTTPS URL without credentials, fragments or custom ports.', 'invalid_reference') }
}
export function localReferencePath(value: string): string | undefined {
  if (/^\\\\[?.]\\/.test(value)) throw new GenerationError('Device paths are unsupported.', 'invalid_reference')
  if (/^[a-z]:[/\\]/i.test(value) || /^\\\\[^\\]+\\[^\\]+/.test(value) || value.startsWith('/')) return value
  if (value.startsWith('~/')) return `${homedir()}/${value.slice(2)}`
  if (/^file:\/\//i.test(value)) {
    const url = new URL(value)
    if (url.username || url.password || url.hash || url.search) throw new GenerationError('Use a file URL without credentials, query or fragment.', 'invalid_reference')
    return fileURLToPath(url)
  }
  if (/^https:\/\//i.test(value)) return undefined
  throw new GenerationError('Use an accessible absolute image path, ~/ or file://, or a public HTTPS URL. Relative paths are ambiguous; never invent attachment paths.', 'invalid_reference')
}
export async function fingerprintReferences(values: string[], signal?: AbortSignal, budget: ReferenceBudget = localReferenceBudget()): Promise<Reference[]> {
  const references: Reference[] = []
  for (const value of values) {
    abortReason(signal)
    const path = localReferencePath(value)
    if (!path) { const url = publicReferenceUrl(value); references.push({ identity: url, url }); continue }
    const handle = await open(path, 'r')
    try {
      const stats = await handle.stat()
      if (!stats.isFile() || stats.size === 0 || stats.size > 32 * 1024 * 1024) throw new GenerationError('Local references must be regular JPEG, PNG, WebP or GIF images up to 32 MiB.', 'invalid_reference')
      budget.reserve(stats.size)
      const hash = createHash('sha256')
      let size = 0
      const stream = handle.createReadStream({ autoClose: false, highWaterMark: 64 * 1024, signal })
      try {
        for await (const chunk of stream as AsyncIterable<Buffer>) {
          abortReason(signal)
          size += chunk.length
          if (size > stats.size) throw new GenerationError('Reference image changed while being read; retry after saving the file.', 'reference_changed')
          hash.update(chunk)
        }
      } finally { stream.destroy() }
      if (size !== stats.size) throw new GenerationError('Reference image changed while being read; retry after saving the file.', 'reference_changed')
      references.push({ identity: hash.digest('hex'), path, size, name: basename(path) })
    } finally { await handle.close() }
  }
  return references
}

/** Bounded re-read: even a file replaced by a huge file cannot allocate beyond its fingerprinted size. */
async function readVerifiedReference(reference: { path: string; size: number; identity: string }, signal?: AbortSignal): Promise<Buffer> {
  const handle = await open(reference.path, 'r')
  const changed = () => new GenerationError('Reference changed after it was fingerprinted; retry after saving the file.', 'reference_changed')
  try {
    abortReason(signal)
    const stats = await handle.stat()
    if (!stats.isFile() || stats.size !== reference.size) throw changed()
    const bytes = Buffer.alloc(reference.size + 1)
    let size = 0
    while (size < bytes.length) {
      abortReason(signal)
      const chunk = await handle.read(bytes, size, Math.min(64 * 1024, bytes.length - size), null)
      if (!chunk.bytesRead) break
      size += chunk.bytesRead
    }
    if (size !== reference.size) throw changed()
    const input = bytes.subarray(0, size)
    if (createHash('sha256').update(input).digest('hex') !== reference.identity) throw changed()
    return input
  } finally { await handle.close() }
}

export async function uploadReferences(references: Reference[], config: MeiGenConfig, signal?: AbortSignal): Promise<string[]> {
  const urls: string[] = []
  for (const reference of references) {
    abortReason(signal)
    if ('url' in reference) { urls.push(reference.url); continue }
    await mediaUploadSlots.acquire(signal)
    try {
      const bytes = await readVerifiedReference(reference, signal)
      urls.push(publicReferenceUrl(await processAndUploadReferenceBuffer(bytes, reference.name, config, signal)))
    } finally { mediaUploadSlots.release() }
  }
  return urls
}

/* ------------------------------------------------------------------ *
 * Reference VIDEO / AUDIO (Seedance 2.x multimodal reference inputs)
 *
 * Deliberately separate from the image path above: no Sharp, no re-encode, no
 * compression. A reference clip must reach the vendor byte-identical, and the
 * backend probes its authoritative duration — anything we did to the bytes here
 * would change what the user is billed for.
 * ------------------------------------------------------------------ */

export type ReferenceMediaKind = 'video' | 'audio'

export type MediaReference =
  | { kind: ReferenceMediaKind; identity: string; url: string }
  | { kind: ReferenceMediaKind; identity: string; path: string; name: string; contentType: string; size: number }

/** Per-kind local source caps. Audio matches the backend's 15MB presign cap; video is the
 *  container budget for a ≤30s clip — the backend still enforces the model's own limit. */
const MEDIA_SOURCE_BYTES: Record<ReferenceMediaKind, number> = {
  video: 200 * 1024 * 1024,
  audio: 15 * 1024 * 1024,
}

const MEDIA_LABEL: Record<ReferenceMediaKind, string> = {
  video: 'Reference videos must be MP4 or MOV',
  audio: 'Reference audio must be WAV or MP3',
}

function ascii(bytes: Buffer, start: number, end: number): string {
  return bytes.subarray(start, end).toString('ascii')
}

/**
 * Identify a local reference clip from its magic bytes (never from the extension alone).
 * WAV is matched on RIFF **and** the WAVE form type, so it can never be confused with the
 * RIFF/WEBP branch used by the image uploader.
 */
export function detectReferenceMedia(bytes: Buffer, name: string): { kind: ReferenceMediaKind; contentType: string } | null {
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    // QuickTime declares brand "qt  "; everything else in the ISO-BMFF family is served as MP4.
    const quicktime = ascii(bytes, 8, 10) === 'qt' || extname(name).toLowerCase() === '.mov'
    return { kind: 'video', contentType: quicktime ? 'video/quicktime' : 'video/mp4' }
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WAVE') {
    return { kind: 'audio', contentType: 'audio/wav' }
  }
  if (bytes.length >= 3 && ascii(bytes, 0, 3) === 'ID3') return { kind: 'audio', contentType: 'audio/mpeg' }
  // Bare MPEG audio: the 11-bit frame sync (0xFF, then the top three bits of the next byte).
  if (bytes.length >= 2 && bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) return { kind: 'audio', contentType: 'audio/mpeg' }
  return null
}

/**
 * The caller may pass the deprecated scalar, the array, or both. Both is only accepted when
 * they agree on the first clip, because the backend rejects a disagreeing pair too — failing
 * here keeps a confused request away from a paid submission.
 */
export function mergeReferenceVideos(scalar: string | undefined, list: string[] | undefined): string[] {
  if (scalar && list?.length && list[0] !== scalar) {
    throw new GenerationError('referenceVideo (deprecated) must be the first entry of referenceVideos, or be omitted entirely.', 'invalid_reference')
  }
  if (list?.length) return [...list]
  return scalar ? [scalar] : []
}

/** The backend's authoritative probe only fetches reference clips from the MeiGen image CDN;
 *  an arbitrary public URL is rejected there with a 400 before any credit is spent. Failing
 *  locally turns that remote rejection into an instruction the caller can act on. */
const MEDIA_REFERENCE_HOST = 'images.meigen.ai'

export function mediaReferenceUrl(value: string, kind: ReferenceMediaKind): string {
  const url = publicReferenceUrl(value)
  if (new URL(url).hostname.toLowerCase() !== MEDIA_REFERENCE_HOST) {
    throw new GenerationError(`Reference ${kind} URLs must be on ${MEDIA_REFERENCE_HOST}. Pass a local file path and the MCP server uploads it for you, or reuse the URL of a clip MeiGen generated earlier.`, 'invalid_reference')
  }
  return url
}

/** Magic bytes we need to classify a container; also the only part of the file held in memory. */
const MEDIA_HEAD_BYTES = 12

/**
 * Hash a clip without materializing it: a ≤200 MiB video times ten concurrent references was
 * enough to OOM the MCP process, and every one of those buffers stayed alive until upload.
 * Only the first `MEDIA_HEAD_BYTES` survive the walk, for format detection.
 */
async function streamMediaFingerprint(path: string, limit: number, kind: ReferenceMediaKind, signal?: AbortSignal): Promise<{ digest: string; size: number; head: Buffer }> {
  const hash = createHash('sha256')
  const head: Buffer[] = []
  let headBytes = 0
  let size = 0
  const stream = createReadStream(path, { signal })
  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      abortReason(signal)
      size += chunk.byteLength
      if (size > limit) throw new GenerationError(`Local reference ${kind} files must be regular files up to ${limit / 1024 / 1024} MiB.`, 'invalid_reference')
      hash.update(chunk)
      if (headBytes < MEDIA_HEAD_BYTES) {
        const slice = chunk.subarray(0, MEDIA_HEAD_BYTES - headBytes)
        head.push(Buffer.from(slice))
        headBytes += slice.byteLength
      }
    }
  } finally { stream.destroy() }
  return { digest: hash.digest('hex'), size, head: Buffer.concat(head) }
}

/**
 * Fingerprint each clip one at a time, streaming. The result carries the path, not the bytes:
 * `uploadMediaReferences` re-reads and re-verifies the file when it is actually that clip's turn,
 * so at most one clip is resident at any moment.
 */
export async function fingerprintMediaReferences(values: string[], kind: ReferenceMediaKind, signal?: AbortSignal, budget: ReferenceBudget = localReferenceBudget()): Promise<MediaReference[]> {
  const references: MediaReference[] = []
  for (const value of values) {
    abortReason(signal)
    const path = localReferencePath(value)
    if (!path) { const url = mediaReferenceUrl(value, kind); references.push({ kind, identity: url, url }); continue }
    const limit = MEDIA_SOURCE_BYTES[kind]
    const stats = await stat(path)
    if (!stats.isFile() || stats.size === 0 || stats.size > limit) {
      throw new GenerationError(`Local reference ${kind} files must be regular files up to ${limit / 1024 / 1024} MiB.`, 'invalid_reference')
    }
    budget.reserve(stats.size)
    const { digest, size, head } = await streamMediaFingerprint(path, limit, kind, signal)
    if (size !== stats.size) throw new GenerationError(`Reference ${kind} changed while being read; retry after saving the file.`, 'reference_changed')
    const detected = detectReferenceMedia(head, path)
    if (!detected || detected.kind !== kind) throw new GenerationError(`${MEDIA_LABEL[kind]}; "${basename(path)}" is not one of those formats.`, 'invalid_reference')
    references.push({ kind, identity: digest, path, name: basename(path), contentType: detected.contentType, size })
  }
  return references
}

/**
 * 进程级媒体上传并发闸:一段视频最多 200 MiB,读进内存后要抱到最长 300 s 的 PUT 结束;
 * 生成 POST 的四槽信号量不管这一段,四个并行任务就能占 ~800 MiB、更多并行没有上限
 * (验收审查 P1 容量风险)。这里把「读文件 + PUT」压到最多 2 段同时在内存里(≤ 400 MiB)。
 */
const MEDIA_UPLOAD_CONCURRENCY = 2
export const mediaUploadSlots = new Semaphore(MEDIA_UPLOAD_CONCURRENCY)

/** Upload once per receipt; images.meigen.ai URLs pass straight through. */
export async function uploadMediaReferences(references: MediaReference[], modelId: string | undefined, config: MeiGenConfig, signal?: AbortSignal): Promise<string[]> {
  const urls: string[] = []
  for (const reference of references) {
    abortReason(signal)
    if ('url' in reference) { urls.push(reference.url); continue }
    await mediaUploadSlots.acquire(signal)
    try {
      abortReason(signal)
      // Read → verify → upload → drop, per clip. Re-hashing is what makes the deferred read safe:
      // the identity in the paid fingerprint must still describe the bytes we are about to send.
      const bytes = await readVerifiedReference(reference, signal)
      urls.push(publicReferenceUrl(await uploadReferenceMedia(bytes, reference.name, reference.contentType, reference.kind, modelId, config, signal)))
    } finally {
      mediaUploadSlots.release()
    }
  }
  return urls
}
