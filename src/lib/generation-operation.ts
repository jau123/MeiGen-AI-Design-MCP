import { createHash, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { MeiGenConfig } from '../config.js'
import type { MeiGenApiClient, MeiGenGenerationStatus } from './meigen-api.js'
import { GenerationError, type GenerationOutput, errorOutput, isRequestNotFound } from './generation-contract.js'
import { ImageUploadError } from './upload.js'
import { withGenerationReceipt } from './generation-request-store.js'
import {
  fingerprintReferences, uploadReferences, publicReferenceUrl, localReferencePath,
  fingerprintMediaReferences, uploadMediaReferences, mergeReferenceVideos, mediaReferenceUrl, type MediaReference,
} from './generation-references.js'
import { streamResponseToFile, withHttpResponse, abortReason } from './generation-http.js'

export interface GenerationInput {
  prompt: string
  modelId?: string
  aspectRatio?: string
  resolution?: string
  modelVariant?: string
  quality?: string
  tier?: string
  duration?: number
  referenceImages?: string[]
  /** Deprecated single-clip alias kept forever; merged into referenceVideos. */
  referenceVideo?: string
  /** Reference video clips: https://images.meigen.ai/... URLs and/or local .mp4/.mov paths (auto-uploaded). */
  referenceVideos?: string[]
  /** Reference audio clips: https://images.meigen.ai/... URLs and/or local .wav/.mp3 paths (auto-uploaded). */
  referenceAudios?: string[]
  requestId?: string
  wait?: boolean
  download?: boolean
}

/** 文件系统错误码:本地路径不存在 / 无权限 / 是目录 —— 修正输入,不是重试也不是查任务。 */
const FILE_ERROR_CODES = new Set(['ENOENT', 'EACCES', 'EPERM', 'EISDIR', 'ENOTDIR', 'ELOOP', 'ENAMETOOLONG'])

/**
 * 提交前(指纹 / 读文件 / presign / PUT)的统一错误边界:生成 POST 还没发出,任何失败都不能
 * 让调用方去 check_generation 查一个不存在的任务(验收审查 P1:缺失的本地路径曾变成
 * request_interrupted → check_generation)。按阶段翻成生成合同里的错误,nextAction 才会落到
 * configure_auth / top_up / resolve_error / retry_request,且都保留同一个 requestId。
 */
export function preSubmitError(error: unknown, signal?: AbortSignal): unknown {
  // 调用方取消(含自定义 abort reason,不只 AbortError):提交前停下,同 ID 可重来
  if (signal?.aborted) return new GenerationError('Cancelled before submission; nothing was submitted or charged.', 'cancelled', 499, true)
  if (error instanceof GenerationError) {
    // 语义错误(invalid_reference / unauthorized / insufficient_credits / reference_changed …)原样透传;
    // 可重试的基础设施错误(presign 超时 request_timeout、坏 JSON invalid_response、5xx)在提交前
    // 一律不能引到 check_generation —— 生成 POST 还没发,没有任务可查(验收审查 P1)。
    if (!error.retryable || error.code === 'cancelled' || error.code === 'pre_submit_failed' || error.code === 'upload_failed') return error
    return new GenerationError(`${error.message} Nothing was submitted or charged.`, 'pre_submit_failed', error.httpStatus, true, error.details)
  }
  if (error instanceof ImageUploadError) {
    const status = error.status
    // 只有 presign 阶段的 401/403 才是 Key 问题;PUT 403 = 签名 URL 过期 / 存储侧拒绝,重新走一遍即可
    if ((status === 401 || status === 403) && error.stage !== 'put') return new GenerationError(error.message, 'unauthorized', status, false)
    if (status === 402) return new GenerationError(error.message, 'insufficient_credits', 402, false)
    if (status === 400 || status === 413 || status === 415 || status === 422) return new GenerationError(error.message, 'invalid_reference', status, false)
    return new GenerationError(`${error.message} No generation was submitted or charged.`, 'upload_failed', status >= 500 && status < 600 ? status : 503, true)
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return new GenerationError('Cancelled before submission; nothing was submitted or charged.', 'cancelled', 499, true)
  }
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : ''
  if (FILE_ERROR_CODES.has(code)) {
    const path = typeof error === 'object' && error !== null && 'path' in error ? ` (${String((error as { path: unknown }).path)})` : ''
    return new GenerationError(`A local reference file could not be read${path}: ${code}. Check the path and permissions; nothing was submitted or charged.`, 'invalid_reference', 400, false)
  }
  return new GenerationError(`${error instanceof Error ? error.message : 'Reference preparation failed.'} Nothing was submitted or charged.`, 'pre_submit_failed', 503, true)
}

export function generationStatusOutput(status: MeiGenGenerationStatus, context: Partial<GenerationOutput>): GenerationOutput {
  const mediaType = status.mediaType ?? context.mediaType ?? 'image'
  const urls = mediaType === 'video' ? (status.videoUrl ? [status.videoUrl] : []) : (status.imageUrls?.length ? status.imageUrls : status.imageUrl ? [status.imageUrl] : [])
  const body: GenerationOutput = { success: status.status !== 'failed', status: status.status, provider: 'meigen', urls, ...context, mediaType,
    ...(status.generationId ? { generationId: status.generationId } : {}), ...(status.modelId ? { modelId: status.modelId } : {}),
    ...(typeof status.creditsUsed === 'number' ? { creditsUsed: status.creditsUsed } : {}), ...(status.creditsStatus ? { creditsStatus: status.creditsStatus } : {}),
    ...(mediaType === 'video' && urls[0] ? { videoUrl: urls[0] } : urls[0] ? { imageUrl: urls[0] } : {}) }
  delete body.pollAfterSeconds
  delete body.observationEnded
  const checkArguments = { ...(body.generationId ? { generationId: body.generationId } : { requestId: body.requestId }), ...(body.requestedMediaType ? { requestedMediaType: body.requestedMediaType } : {}) }
  if (status.status === 'failed') return { ...body, error: { code: status.failureCode || 'generation_failed', message: status.error ?? 'Generation failed', retryable: false }, nextAction: { type: 'review_failure', message: 'Review this job and its reported creditsStatus. An intentionally new generation requires a new requestId.' } }
  if (status.status === 'completed' && !urls.length) return { ...body, status: 'unknown', success: false, error: { code: 'result_pending', message: 'Generation completed but the result URL is missing. Do NOT re-submit with a new UUID.', retryable: true }, nextAction: { type: 'check_generation', tool: 'check_generation', arguments: checkArguments, afterSeconds: 30 } }
  if (status.status === 'processing') {
    const ended = typeof status.pollHintSeconds === 'number' && status.pollHintSeconds <= 0
    return { ...body, ...(ended ? {} : { pollAfterSeconds: 30 }), observationEnded: ended, nextAction: ended ? { type: 'check_gallery', message: 'The observation window ended; this is not proof of failure or refund. Keep the existing request and check later.' } : { type: 'check_generation', tool: 'check_generation', arguments: checkArguments, afterSeconds: 30 } }
  }
  const requestedMediaType = context.requestedMediaType ?? context.mediaType
  if (requestedMediaType && requestedMediaType !== mediaType) {
    return { ...body, requestedMediaType, nextAction: { type: 'review_media_type', message: `This request produced ${mediaType} instead of the requested ${requestedMediaType}. Keep its result URLs and IDs, and review the selected model before advancing the workflow. Do not automatically submit another paid generation.` } }
  }
  return { ...body, nextAction: { type: 'use_result', message: 'Pass these URLs to the next workflow step or present them when appropriate.' } }
}

async function saveGenerationResult(body: GenerationOutput, signal?: AbortSignal): Promise<string> {
  const video = body.mediaType === 'video'
  const url = publicReferenceUrl(body.urls[0])
  const custom = video ? process.env.MEIGEN_VIDEO_OUTPUT_DIR : process.env.MEIGEN_OUTPUT_DIR
  const xdg = video ? process.env.XDG_VIDEOS_DIR : process.env.XDG_PICTURES_DIR
  const expand = (path: string) => path.startsWith('~/') ? join(homedir(), path.slice(2)) : path
  const directory = custom ? expand(custom) : xdg ? join(expand(xdg), 'meigen') : join(homedir(), video ? 'Movies' : 'Pictures', 'meigen')
  await mkdir(directory, { recursive: true })
  return await withHttpResponse(url, { redirect: 'error' }, video ? 120_000 : 30_000, async (response, downloadSignal) => {
    if (!response.ok) throw new GenerationError(`Result download failed (${response.status}).`, 'download_failed', response.status, true)
    const type = response.headers.get('content-type') ?? ''
    const extension = video ? 'mp4' : type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
    const path = join(directory, `${new Date().toISOString().slice(0, 10)}_${randomUUID()}.${extension}`)
    await streamResponseToFile(response, path, video ? 512 * 1024 * 1024 : 64 * 1024 * 1024, downloadSignal)
    return path
  }, signal)
}

export async function runMeiGenGeneration(mediaType: 'image' | 'video', input: GenerationInput, api: MeiGenApiClient, config: MeiGenConfig, signal?: AbortSignal, notify?: (message: string) => Promise<void>): Promise<GenerationOutput> {
  const requestId = (input.requestId ?? randomUUID()).toLowerCase()
  const context: Partial<GenerationOutput> = { provider: 'meigen', requestId, mediaType, requestedMediaType: mediaType }
  try {
    if (input.wait === false && !input.requestId) throw new GenerationError('wait=false requires a persistent requestId UUID chosen by the caller.', 'request_id_required')
    if (!config.meigenApiToken) throw new GenerationError('This local generation path requires an existing legacy MEIGEN_API_TOKEN configured privately. New MeiGen connections should use remote OAuth at https://www.meigen.ai/api/mcp. Generation uses purchased credits only.', 'authentication_required', 401)
    // 提交前阶段(指纹 / 读文件)统一错误边界,见 preSubmitError
    let references: Awaited<ReturnType<typeof fingerprintReferences>>
    let parameters: Omit<GenerationInput, 'requestId' | 'wait' | 'download' | 'referenceImages' | 'referenceVideos' | 'referenceAudios'>
    let _id: GenerationInput['requestId'], _wait: GenerationInput['wait'], _download: GenerationInput['download'], _references: GenerationInput['referenceImages'], _videos: GenerationInput['referenceVideos'], _audios: GenerationInput['referenceAudios']
    let videos: string[]
    let audios: string[]
    let videoReferences: MediaReference[] = []
    let audioReferences: MediaReference[] = []
    try {
      abortReason(signal)
      references = await fingerprintReferences(input.referenceImages ?? [], signal)
      ;({ requestId: _id, wait: _wait, download: _download, referenceImages: _references, referenceVideos: _videos, referenceAudios: _audios, ...parameters } = input)
      videos = mergeReferenceVideos(parameters.referenceVideo, input.referenceVideos)
      audios = input.referenceAudios ?? []
      // Identity of an OLD request must not move. A lone images.meigen.ai clip passed through the
      // deprecated scalar keeps its historical place in both the fingerprint and the request body,
      // so a receipt written by an earlier release still recovers its already-paid job.
      const legacyScalarOnly = !input.referenceVideos?.length && audios.length === 0 &&
        (videos.length === 0 || localReferencePath(videos[0]) === undefined)
      if (legacyScalarOnly) {
        // 同一条 host 规则:images.meigen.ai 的 URL 归一化结果与 publicReferenceUrl 逐字节相同,旧 receipt
        // 的身份不动;其它 host 本来就会被后端在扣点前 400,这里改为本地即刻给出同一份指引。
        if (parameters.referenceVideo) parameters.referenceVideo = mediaReferenceUrl(parameters.referenceVideo, 'video')
      } else {
        delete parameters.referenceVideo
        videoReferences = await fingerprintMediaReferences(videos, 'video', signal)
        audioReferences = await fingerprintMediaReferences(audios, 'audio', signal)
      }
    } catch (error) {
      throw preSubmitError(error, signal)
    }
    const canonicalParameters = Object.fromEntries(Object.entries(parameters).filter(([, value]) => value !== undefined).sort(([left], [right]) => left.localeCompare(right)))
    const fingerprint = createHash('sha256').update(JSON.stringify({ mediaType, parameters: canonicalParameters, references: references.map(value => value.identity),
      // Absent sub-arrays keep pre-existing fingerprints byte-identical.
      ...(videoReferences.length ? { videoReferences: videoReferences.map(value => value.identity) } : {}),
      ...(audioReferences.length ? { audioReferences: audioReferences.map(value => value.identity) } : {}) })).digest('hex')
    const submitted = await withGenerationReceipt(config, requestId, fingerprint, async (receipt, save) => {
      if (input.requestId || receipt.references || receipt.generationId) {
        try {
          // Authorize the current account after key rotation; a local receipt is not access control.
          const existing = await api.getGenerationByRequestId(requestId, signal)
          if (!existing.generationId) throw new GenerationError('Existing request has no generationId yet; query it again shortly.', 'in_progress', 409, true, { retryAfterSeconds: 5 })
          receipt.generationId = existing.generationId; receipt.modelId = existing.modelId; receipt.creditsUsed = existing.creditsUsed
          context.generationId = existing.generationId
          await save()
          return { ...existing, success: true, error: existing.error ?? undefined, deduped: true }
        } catch (error) {
          // A lost POST may have no server receipt. Reuse its prepared URLs and the exact UUID.
          // Never expose a cached job under another account or automatically create a replacement.
          if (isRequestNotFound(error) && receipt.generationId) throw new GenerationError('This saved request is not accessible with the current account. Use the original account to recover it; only an intentionally new generation should use a new UUID.', 'request_id_collision', 409)
          const unsubmitted = isRequestNotFound(error) && !receipt.generationId
          const paymentRetry = error instanceof GenerationError && error.httpStatus === 402 && !receipt.generationId
          const expiredLease = error instanceof GenerationError && error.code === 'in_progress' && error.details.retryAfterSeconds === 0 && !receipt.generationId
          if (!unsubmitted && !paymentRetry && !expiredLease) throw error
        }
      }
      try {
        if (!receipt.references) { receipt.references = await uploadReferences(references, config, signal); await save() }
        if (videoReferences.length && !receipt.videoReferences) { receipt.videoReferences = await uploadMediaReferences(videoReferences, input.modelId, config, signal); await save() }
        if (audioReferences.length && !receipt.audioReferences) { receipt.audioReferences = await uploadMediaReferences(audioReferences, input.modelId, config, signal); await save() }
      } catch (error) {
        throw preSubmitError(error, signal)
      }
      // Empty stays undefined, never []: the submitted body is this request's paid identity.
      const params = { ...parameters, requestId, referenceImages: receipt.references,
        ...(receipt.videoReferences?.length ? { referenceVideos: receipt.videoReferences } : {}),
        ...(receipt.audioReferences?.length ? { referenceAudios: receipt.audioReferences } : {}), signal }
      const result = mediaType === 'video' ? await api.generateVideo({ ...params, modelId: input.modelId! }) : await api.generateImage(params)
      // Persist the accepted handle BEFORE polling or optional downloads. Never clear it on terminal results.
      receipt.generationId = result.generationId; receipt.modelId = result.modelId; receipt.creditsUsed = result.creditsUsed
      context.generationId = result.generationId
      await save()
      return result
    }, signal, warning => { context.receiptWarning = warning })
    Object.assign(context, { generationId: submitted.generationId, modelId: submitted.modelId, creditsUsed: submitted.creditsUsed, deduped: submitted.deduped })
    const knownStatus = generationStatusOutput({ ...submitted, status: submitted.status ?? 'processing', imageUrl: submitted.imageUrl ?? null, imageUrls: submitted.imageUrls ?? null, error: submitted.error ?? null }, context)
    if (input.wait === false) return knownStatus
    await notify?.(`Generation accepted. requestId=${requestId}; generationId=${submitted.generationId}. Waiting for completion...`)
    const result = knownStatus.status !== 'processing' ? knownStatus : generationStatusOutput(await api.waitForGeneration(submitted.generationId!, undefined, async elapsed => { await notify?.(`Generation ${submitted.generationId} is still processing (${Math.round(elapsed / 1000)}s).`) }, signal), context)
    if (result.status === 'completed' && result.success && input.download !== false) {
      try { result.savedPath = await saveGenerationResult(result, signal) }
      catch (error) { result.downloadWarning = `Local save skipped: ${error instanceof Error ? error.message : 'download failed'}. The generation succeeded; keep its URLs and IDs.` }
    }
    return result
  } catch (error) { return errorOutput(error, context) }
}
