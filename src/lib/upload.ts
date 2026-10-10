/**
 * Image compression and R2 upload utility
 * Replicates the frontend's ReferenceImageUpload.tsx logic for Node.js:
 *   compress (max 2MB, max 2048px) → presign → PUT to R2 → public URL
 */

import { readFileSync, statSync } from 'fs'
import { createHash } from 'node:crypto'
import { basename, extname } from 'path'
import sharp from 'sharp'
import type { MeiGenConfig } from '../config.js'
import { withHttpResponse, boundedJson, abortReason } from './generation-http.js'

const MAX_SIZE_BYTES = 2 * 1024 * 1024  // 2MB compression target (matches frontend)
const MAX_DIMENSION = 2048               // Max width or height (matches frontend)

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

/** Magic bytes signatures for supported image formats */
const MAGIC_BYTES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4E, 0x47] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  // WebP: starts with RIFF....WEBP
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
]

/** Validate that file content matches its declared MIME type via magic bytes */
function validateMagicBytes(buffer: Buffer, declaredMime: string): void {
  if (buffer.length < 12) {
    throw new Error('File too small to be a valid image')
  }

  const matched = MAGIC_BYTES.find(sig => {
    const offset = sig.offset || 0
    return sig.bytes.every((b, i) => buffer[offset + i] === b)
  })

  if (!matched) {
    throw new Error('File content does not match any supported image format. The file may be corrupted or not a real image.')
  }

  // WebP needs additional check: bytes 8-11 should be "WEBP"
  if (matched.mime === 'image/webp') {
    const webpTag = buffer.slice(8, 12).toString('ascii')
    if (webpTag !== 'WEBP') {
      // It's a RIFF file but not WebP — could be AVI, WAV, etc.
      if (declaredMime === 'image/webp') {
        throw new Error('File has RIFF header but is not a WebP image')
      }
      // Not WebP, check if it matches declared type via other signatures
      const actualMatch = MAGIC_BYTES.find(sig =>
        sig.mime !== 'image/webp' && sig.bytes.every((b, i) => buffer[i] === b)
      )
      if (!actualMatch || actualMatch.mime !== declaredMime) {
        throw new Error(`File content does not match declared type ${declaredMime}`)
      }
      return
    }
  }

  // For non-WebP RIFF matches, verify declared type matches detected type
  if (matched.mime !== declaredMime && !(matched.mime === 'image/webp' && declaredMime === 'image/webp')) {
    throw new Error(`File extension suggests ${declaredMime} but content is ${matched.mime}`)
  }
}

interface PresignResponse {
  success: boolean
  error?: string
  presignedUrl: string
  publicUrl: string
}

/** Upload infrastructure errors retain their status for Skills recovery guidance. */
/** `stage` 区分 presign(鉴权/额度/校验)与 PUT(对象存储):PUT 403 是签名 URL 过期/存储侧拒绝,不是 API Key 无效。 */
export class ImageUploadError extends Error {
  constructor(message: string, public status: number, public stage: 'presign' | 'put' = 'presign') { super(message) }
}


export interface UploadResult {
  publicUrl: string
  originalSize: number
  compressedSize: number
}

/**
 * Compress an image buffer to fit within MAX_SIZE_BYTES and MAX_DIMENSION.
 * Strategy: resize to fit max dimension, then reduce JPEG quality if still too large.
 */
async function compressImage(
  inputBuffer: Buffer,
  mimeType: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const metadata = await sharp(inputBuffer).metadata()
  const { width, height } = metadata

  // Already small enough — no compression needed
  const needsResize = (width && width > MAX_DIMENSION) || (height && height > MAX_DIMENSION)
  if (!needsResize && inputBuffer.byteLength <= MAX_SIZE_BYTES) {
    return { buffer: inputBuffer, mimeType }
  }

  // Resize to fit within MAX_DIMENSION, preserving aspect ratio
  let pipeline = sharp(inputBuffer)
  if (needsResize) {
    pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
  }

  // Output as JPEG for best compression (unless already WebP)
  if (mimeType === 'image/webp') {
    let result = await pipeline.webp({ quality: 85 }).toBuffer()
    if (result.byteLength <= MAX_SIZE_BYTES) {
      return { buffer: result, mimeType: 'image/webp' }
    }
    // Reduce quality iteratively
    for (const q of [80, 70, 60]) {
      result = await sharp(inputBuffer)
        .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: q })
        .toBuffer()
      if (result.byteLength <= MAX_SIZE_BYTES) {
        return { buffer: result, mimeType: 'image/webp' }
      }
    }
    return { buffer: result, mimeType: 'image/webp' }
  }

  // Default: output as JPEG
  let result = await pipeline.jpeg({ quality: 85 }).toBuffer()
  if (result.byteLength <= MAX_SIZE_BYTES) {
    return { buffer: result, mimeType: 'image/jpeg' }
  }
  // Reduce quality iteratively
  for (const q of [80, 70, 60]) {
    result = await sharp(inputBuffer)
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: q })
      .toBuffer()
    if (result.byteLength <= MAX_SIZE_BYTES) {
      return { buffer: result, mimeType: 'image/jpeg' }
    }
  }
  return { buffer: result, mimeType: 'image/jpeg' }
}

/**
 * Upload a buffer to R2 via the presign flow.
 * No authentication required — the presign endpoint validates content-type and size only.
 */
async function uploadToR2(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  config: MeiGenConfig,
  signal?: AbortSignal,
): Promise<string> {
  try {
  abortReason(signal)
  const presignData = await withHttpResponse(`${config.uploadGatewayUrl}/upload/presign`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, contentType: mimeType, size: buffer.byteLength }),
  }, 15_000, async response => {
    const data = await boundedJson(response)
    if (!response.ok) throw new ImageUploadError(typeof data.error === 'string' ? data.error : `Presign failed: ${response.status}`, response.status)
    if (!data.success || typeof data.presignedUrl !== 'string' || typeof data.publicUrl !== 'string') throw new ImageUploadError('Upload gateway returned an incomplete response. Retry the upload shortly.', 503)
    return data as unknown as PresignResponse
  }, signal)
  await withHttpResponse(presignData.presignedUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: buffer }, 30_000, async response => {
    if (!response.ok) throw new ImageUploadError(`Upload failed: ${response.status}`, response.status, 'put')
    await response.body?.cancel()
  }, signal)

  return presignData.publicUrl
  } catch (error) {
    if (signal?.aborted) throw signal.reason
    if (error instanceof ImageUploadError) throw error
    throw new ImageUploadError('Image upload is temporarily unavailable. Retry the upload shortly.', 503)
  }
}

/**
 * Read a local image, compress it, and upload to R2.
 * Returns the public URL for use as referenceImages in generate_image.
 */
export async function processAndUploadImage(
  filePath: string,
  config: MeiGenConfig,
): Promise<UploadResult> {
  // Read file
  const originalBuffer = readFileSync(filePath)
  const originalSize = originalBuffer.byteLength

  // Detect MIME type from extension
  const ext = extname(filePath).toLowerCase()
  const mimeType = MIME_MAP[ext]
  if (!mimeType) {
    throw new Error(`Unsupported image format: ${ext}. Supported: JPEG, PNG, WebP, GIF`)
  }

  // Validate file content matches declared type
  validateMagicBytes(originalBuffer, mimeType)

  // Compress
  const compressed = await compressImage(originalBuffer, mimeType)

  // Upload
  const filename = basename(filePath)
  const publicUrl = await uploadToR2(compressed.buffer, filename, compressed.mimeType, config)

  return {
    publicUrl,
    originalSize,
    compressedSize: compressed.buffer.byteLength,
  }
}

const skillUploads = new Map<string, { url: string; createdAt: number }>()
const SKILL_SOURCE_BYTES = 32 * 1024 * 1024
const UPSCALE_SOURCE_BYTES = 64 * 1024 * 1024
const SKILL_OUTPUT_BYTES = 8 * 1024 * 1024
const UPSCALE_UPLOAD_BYTES = 9_500_000 // Below the existing gateway's 10 MiB limit, without reducing dimensions.

/** Skills preserve alpha and up to 4096px, independently of the ordinary 2048px JPEG path. */
export async function processAndUploadSkillImage(filePath: string, config: MeiGenConfig, options: { preserveDimensions?: boolean; signal?: AbortSignal } = {}): Promise<string> {
  return uploadSkillSource(filePath, config, options.preserveDimensions === true, options.signal)
}

/** Keep the source dimensions so the shared backend can ask before any downscaling. */
export async function processAndUploadUpscaleImage(filePath: string, config: MeiGenConfig, signal?: AbortSignal): Promise<string> {
  return uploadSkillSource(filePath, config, true, signal)
}

async function uploadSkillSource(filePath: string, config: MeiGenConfig, upscale: boolean, signal?: AbortSignal): Promise<string> {
  abortReason(signal)
  const limit = upscale ? UPSCALE_SOURCE_BYTES : SKILL_SOURCE_BYTES
  const file = statSync(filePath)
  if (!file.isFile()) throw new Error('Provide an accessible regular image file, not a directory or device.')
  if (file.size > limit) throw new Error(`Source image exceeds ${limit / 1024 / 1024} MiB.`)
  const input = readFileSync(filePath)
  if (input.length > limit) throw new Error(`Source image exceeds ${limit / 1024 / 1024} MiB.`)
  const mime = MIME_MAP[extname(filePath).toLowerCase()]
  if (!mime || (upscale && mime === 'image/gif')) throw new Error(upscale ? 'Upscale requires a still JPEG, PNG or WebP image.' : 'Use a JPEG, PNG, WebP or GIF image.')
  validateMagicBytes(input, mime)
  const hash = createHash('sha256').update(JSON.stringify([config.uploadGatewayUrl, upscale])).update(input).digest('hex')
  const prior = skillUploads.get(hash)
  if (prior && Date.now() - prior.createdAt < 3_600_000) return prior.url
  const converted = upscale ? await prepareUpscaleSourceImage(input, mime, signal) : await prepareSkillImage(input, mime, false, signal)
  abortReason(signal)
  const url = await uploadToR2(converted.buffer, basename(filePath), converted.mimeType, config, signal)
  abortReason(signal)
  if (skillUploads.size >= 100) skillUploads.delete(skillUploads.keys().next().value!)
  skillUploads.set(hash, { url, createdAt: Date.now() })
  return url
}

export async function prepareSkillImage(input: Buffer, mimeType: string, preserveDimensions = false, signal?: AbortSignal): Promise<{ buffer: Buffer; mimeType: string }> {
  if (preserveDimensions) return prepareUpscaleSourceImage(input, mimeType, signal)
  return prepareLocalSkillImage(input, mimeType, false, signal)
}

/** Full decode, auto-orientation and metadata removal, with no resize for upscale sources. */
export async function prepareUpscaleSourceImage(input: Buffer, mimeType: string, signal?: AbortSignal): Promise<{ buffer: Buffer; mimeType: string }> {
  return prepareLocalSkillImage(input, mimeType, true, signal)
}

/** Stop awaiting native work immediately; its existing Sharp timeout still bounds native cleanup. */
async function imageStep<T>(work: () => Promise<T>, stop: () => void, signal?: AbortSignal): Promise<T> {
  abortReason(signal)
  let abort: (() => void) | undefined
  try {
    return await new Promise<T>((resolve, reject) => {
      abort = () => { stop(); reject(signal?.reason ?? new DOMException('Image preparation cancelled', 'AbortError')) }
      signal?.addEventListener('abort', abort, { once: true })
      work().then(resolve, reject)
    })
  } finally { if (abort) signal?.removeEventListener('abort', abort) }
}

async function prepareLocalSkillImage(input: Buffer, mimeType: string, upscale: boolean, signal?: AbortSignal) {
  abortReason(signal)
  const sourceLimit = upscale ? UPSCALE_SOURCE_BYTES : SKILL_SOURCE_BYTES
  if (input.length > sourceLimit) throw new Error(`Source image exceeds ${sourceLimit / 1024 / 1024} MiB.`)
  validateMagicBytes(input, mimeType)
  const budgetSeconds = upscale ? 90 : 12
  const deadline = Date.now() + budgetSeconds * 1000
  const pipeline = sharp(input, { limitInputPixels: 64_000_000, failOn: 'warning' }).timeout({ seconds: budgetSeconds }).rotate()
  try {
    const metadata = await imageStep(() => pipeline.metadata(), () => pipeline.destroy(), signal)
    abortReason(signal)
    if (!metadata.width || !metadata.height || !['jpeg', 'png', 'webp', 'gif'].includes(metadata.format ?? '') ||
      (upscale && (metadata.format === 'gif' || (metadata.pages ?? 1) > 1))) {
      throw new Error(upscale ? 'Upscale requires a still JPEG, PNG or WebP image.' : 'Use a valid JPEG, PNG, WebP or GIF image.')
    }
    if (!upscale) pipeline.resize(4096, 4096, { fit: 'inside', withoutEnlargement: true })
    // Sharp removes EXIF/XMP/ICC by default. Never use a metadata-only, original-byte fast path.
    // GIF defaults to the first frame; every source is fully decoded before uploading.
    const outputLimit = upscale ? UPSCALE_UPLOAD_BYTES : SKILL_OUTPUT_BYTES
    const encode = async (format: 'jpeg' | 'png' | 'webp', quality?: number) => {
      abortReason(signal)
      const seconds = Math.floor((deadline - Date.now()) / 1000)
      if (seconds <= 0) throw new Error('Image processing timeout')
      const candidate = pipeline.clone().timeout({ seconds })
      try {
        const encoded = await imageStep(() => (format === 'jpeg' ? candidate.jpeg({ quality }) : format === 'png' ? candidate.png() : candidate.webp({ quality, alphaQuality: 100 })).toBuffer(), () => candidate.destroy(), signal)
        abortReason(signal)
        return encoded
      } finally { candidate.destroy() }
    }
    // WebP sources can be encoded directly: a full-size intermediate PNG is unnecessary.
    const firstFormat = metadata.format === 'jpeg' ? 'jpeg' : metadata.format === 'webp' ? 'webp' : 'png'
    let buffer = await encode(firstFormat, firstFormat === 'jpeg' ? 95 : 90)
    let outputMime = `image/${firstFormat}`
    for (const quality of [90, 80, 65]) {
      if (buffer.length <= outputLimit) break
      if (firstFormat === 'webp' && quality === 90) continue
      const candidate = await encode('webp', quality)
      // Quality changes do not guarantee monotonically smaller encoded files.
      if (candidate.length < buffer.length) { buffer = candidate; outputMime = 'image/webp' }
    }
    if (buffer.length > outputLimit) throw new ImageUploadError(upscale
      ? 'The original dimensions could not fit the local upload gateway after compression. Provide a direct public HTTPS original-image URL (up to 64 MiB); dimensions have not been reduced and no generation has started.'
      : 'Image remains over 8 MiB after compression within 4096px. Provide a smaller or less detailed image before uploading.', 413)
    return { buffer, mimeType: outputMime }
  } catch (error) {
    abortReason(signal)
    if (error instanceof ImageUploadError) throw error
    if (error instanceof Error && /timeout|timed out/i.test(error.message)) {
      throw new ImageUploadError(upscale
        ? 'Image processing exceeded the local time budget. Provide a direct public HTTPS original-image URL (up to 64 MiB); dimensions have not been reduced and no generation has started.'
        : 'Image processing timed out. Retry with a smaller source; no image was uploaded and no generation has started.', upscale ? 413 : 503)
    }
    throw new Error(upscale
      ? 'Unable to decode this image. Upscale requires a still JPEG, PNG or WebP within 64 million pixels.'
      : 'Unable to decode this image. Use a valid JPEG, PNG, WebP or GIF within 64 million pixels.')
  } finally { pipeline.destroy() }
}

/** Ordinary generation fingerprints these exact bytes before upload, so retries never reopen a changed file. */
export async function processAndUploadReferenceBuffer(input: Buffer, filename: string, config: MeiGenConfig, signal?: AbortSignal): Promise<string> {
  abortReason(signal)
  const mime = MAGIC_BYTES.find(signature => signature.bytes.every((byte, index) => input[(signature.offset ?? 0) + index] === byte))?.mime
  if (!mime) throw new Error('Use a valid JPEG, PNG, WebP or GIF reference image.')
  const converted = await prepareSkillImage(input, mime, false, signal)
  abortReason(signal)
  return uploadToR2(converted.buffer, filename, converted.mimeType, config, signal)
}

/**
 * Upload a reference VIDEO or AUDIO clip through the site's presign route.
 *
 * Deliberately not the image gateway: the reference-media route is authenticated (Supabase
 * session OR meigen_sk_ API token), enforces the selected model's own per-file cap, and stores
 * under the 7-day ref-videos/ R2 lifecycle. The bytes are uploaded verbatim — no decode, no
 * re-encode, no dimension change — because the backend probes this exact file for the duration
 * that drives billing.
 */
export async function uploadReferenceMedia(
  input: Buffer,
  filename: string,
  contentType: string,
  kind: 'video' | 'audio',
  modelId: string | undefined,
  config: MeiGenConfig,
  signal?: AbortSignal,
): Promise<string> {
  abortReason(signal)
  if (!config.meigenApiToken) {
    throw new ImageUploadError('An existing legacy MEIGEN_API_TOKEN is required for local reference video/audio upload. New MeiGen connections should use remote OAuth at https://www.meigen.ai/api/mcp. For an existing local integration, you can also pass an https://images.meigen.ai/... URL from an earlier generation.', 401)
  }
  const base = config.meigenBaseUrl.replace(/\/$/, '')
  const presign = await withHttpResponse(`${base}/api/upload/reference-video`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.meigenApiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, contentType, size: input.byteLength, ...(modelId ? { modelId } : {}), kind }),
  }, 20_000, async response => {
    const data = await boundedJson(response)
    if (!response.ok) throw new ImageUploadError(typeof data.error === 'string' ? data.error : `Reference ${kind} presign failed: ${response.status}`, response.status)
    if (!data.success || typeof data.presignedUrl !== 'string' || typeof data.publicUrl !== 'string') {
      throw new ImageUploadError(`The reference ${kind} upload service returned an incomplete response. Retry the upload shortly.`, 503)
    }
    return data as unknown as PresignResponse
  }, signal)
  abortReason(signal)
  // Large clips need a much longer window than a compressed reference image.
  await withHttpResponse(presign.presignedUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: input }, 300_000, async response => {
    if (!response.ok) throw new ImageUploadError(`Reference ${kind} upload failed: ${response.status}`, response.status, 'put')
    await response.body?.cancel()
  }, signal)
  return presign.publicUrl
}
