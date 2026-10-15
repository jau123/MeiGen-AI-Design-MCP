import { z } from 'zod'

export const generationControls = {
  requestId: z.string().uuid().optional().describe('Persistent UUID for this workflow step. Required when wait=false. Reuse with identical inputs after interruption, including after MCP restart; use a new UUID for a new generation. Omit only for a new interactive generation.'),
  wait: z.boolean().default(true).describe('MeiGen only: false returns the accepted generation ID immediately; poll check_generation separately. Default true waits for completion. Submit-only requires requestId.'),
  download: z.boolean().default(true).describe('Save the completed result locally (default true). Set false for URL-only workflows. Ignored when wait=false. Other providers may return inline image content when local saving is disabled.'),
}

export const draftResultSchema = z.object({
  stage: z.enum(['draft', 'final']), duration: z.number(), referenceVideoSeconds: z.number(), hasReferenceVideo: z.boolean(),
  expiresAt: z.string().optional(), sourceGenerationId: z.string().optional(), finalGenerationId: z.string().optional(), finalCredits: z.number().nonnegative().optional(),
})
export const generationOutputSchema = {
  seedanceDraft: draftResultSchema.optional(),
  success: z.boolean(),
  status: z.enum(['processing', 'completed', 'failed', 'error', 'unknown']),
  provider: z.enum(['meigen', 'openai']).optional(),
  requestId: z.string().optional(), generationId: z.string().optional(),
  mediaType: z.enum(['image', 'video']).optional(), requestedMediaType: z.enum(['image', 'video']).optional(), modelId: z.string().optional(),
  creditsUsed: z.number().optional(), creditsStatus: z.string().optional(),
  urls: z.array(z.string()), imageUrl: z.string().optional(), videoUrl: z.string().optional(),
  savedPath: z.string().optional(), downloadWarning: z.string().optional(), receiptWarning: z.string().optional(),
  pollAfterSeconds: z.number().optional(), observationEnded: z.boolean().optional(), deduped: z.boolean().optional(),
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean(), httpStatus: z.number().optional(), retryAfterSeconds: z.number().optional(), required: z.number().optional(), available: z.number().optional() }).optional(),
  nextAction: z.object({ type: z.string(), tool: z.string().optional(), arguments: z.record(z.unknown()).optional(), afterSeconds: z.number().optional(), message: z.string().optional() }).optional(),
}
export type GenerationOutput = z.infer<z.ZodObject<typeof generationOutputSchema>>

/** Completed remote artifacts remain usable even when a host cannot render a preview. */
export function generationResources(body: GenerationOutput) {
  if (!body.success || body.status !== 'completed') return []
  return [...new Set([...body.urls, body.imageUrl, body.videoUrl].filter((v): v is string => !!v))].flatMap((uri, index) => {
    let url: URL
    try { url = new URL(uri) } catch { return [] }
    if (url.protocol !== 'https:' || url.username || url.password) return []
    const extension = url.pathname.split('.').pop()?.toLowerCase() ?? ''
    const mimeType = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
      avif: 'image/avif', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm' } as Record<string, string>)[extension]
    return [{ type: 'resource_link' as const, uri, name: `MeiGen ${body.mediaType ?? 'media'} ${index + 1}`,
      ...(mimeType ? { mimeType } : {}) }]
  })
}

export function generationResult(body: GenerationOutput) {
  // Keep the text fallback exactly equivalent to the structured payload on all hosts.
  body = JSON.parse(JSON.stringify(body)) as GenerationOutput
  return { content: [{ type: 'text' as const, text: JSON.stringify(body) }, ...generationResources(body)], structuredContent: body, ...(!body.success ? { isError: true } : {}) }
}

export class GenerationError extends Error {
  constructor(message: string, readonly code = 'request_failed', readonly httpStatus = 400, readonly retryable = false,
    readonly details: { retryAfterSeconds?: number; required?: number; available?: number } = {}) { super(message) }
}

export function isRequestNotFound(error: unknown): error is GenerationError {
  return error instanceof GenerationError && error.httpStatus === 404 && error.code === 'request_not_found'
}

export function errorOutput(error: unknown, context: Partial<GenerationOutput> = {}): GenerationOutput {
  const cancelled = error instanceof Error && error.name === 'AbortError'
  const known = error instanceof GenerationError
  const detail = { code: known ? error.code : cancelled ? 'cancelled' : 'request_interrupted', message: error instanceof Error ? error.message : 'Request failed', retryable: known ? error.retryable : true, ...(known ? { httpStatus: error.httpStatus, ...error.details } : {}) }
  const recovery = context.generationId || context.requestId
  const endpointUnavailable = known && error.code === 'endpoint_unavailable'
  const nextAction = endpointUnavailable
    ? { type: 'check_backend', message: 'Verify the configured MeiGen API URL and deploy or restore the compatible request-recovery endpoint. Keep the original requestId and inputs; an unknown HTTP 404 does not mean the request was never submitted. Do not automatically submit again or create a new UUID. If generationId is already known, check_generation with that ID can use the existing status endpoint.' }
    : known && error.code === 'in_progress' && error.details.retryAfterSeconds === 0
    ? { type: 'retry_request', message: 'The submission lease expired without a job. Resend the exact original generate_image/video inputs with this same requestId. A status query cannot restart submission.' }
    : known && error.code === 'in_progress'
      ? { type: 'check_generation', tool: 'check_generation', arguments: { ...(context.requestId ? { requestId: context.requestId } : { generationId: context.generationId }), ...(context.requestedMediaType ? { requestedMediaType: context.requestedMediaType } : {}) }, afterSeconds: error.details.retryAfterSeconds ?? 5, message: 'Another submission is still active; wait before checking again.' }
    : known && error.httpStatus === 402
    ? context.provider === 'meigen'
      ? { type: 'top_up', message: 'Top up purchased credits on the same MeiGen account at https://www.meigen.ai/profile. Then resubmit the exact original inputs with the same requestId; polling cannot retry payment.' }
      : { type: 'configure_provider_billing', message: 'Check billing or quota with the selected provider. MeiGen credits do not pay for this provider. Verify any existing provider job before deliberately trying again; MeiGen requestId recovery does not apply.' }
    : known && (error.code === 'upload_failed' || error.code === 'pre_submit_failed')
    ? { type: 'retry_request', message: 'Reference preparation or upload failed before submission; nothing was submitted or charged. Retry the exact same inputs with this same requestId once the service recovers.' }
    : known && error.code === 'cancelled' && !context.generationId
    ? { type: 'retry_request', message: 'Cancelled before submission; nothing was submitted or charged. If still wanted, resend the same inputs with the same requestId.' }
    : known && (error.httpStatus === 401 || error.httpStatus === 403)
      ? { type: 'configure_auth', message: context.provider === 'meigen'
        ? 'Check or replace the MeiGen key in private MCP configuration, then recover with the same requestId. Never paste a secret into chat.'
        : 'Check or replace the selected provider key in private MCP configuration. Verify any existing provider job before deliberately retrying; MeiGen requestId recovery does not apply. Never paste a secret into chat.' }
      : !detail.retryable && !context.generationId
        ? { type: 'resolve_error', message: 'Resolve the reported issue. Keep the original UUID for unchanged retries; a deliberately changed request needs a new UUID.' }
        : recovery ? { type: 'check_generation', tool: 'check_generation', arguments: { ...(context.generationId ? { generationId: context.generationId } : { requestId: context.requestId }), ...(context.requestedMediaType ? { requestedMediaType: context.requestedMediaType } : {}) }, message: 'Keep this requestId. Check the existing request before submitting again; a new UUID creates a new paid generation.' }
          : { type: 'resolve_error', message: 'Correct the reported issue before retrying.' }
  return { success: false, status: context.generationId || (endpointUnavailable && recovery) ? 'unknown' : 'error', urls: [], ...context, error: detail, nextAction }
}
