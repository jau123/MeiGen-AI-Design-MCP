/** Transport-independent Skills guidance; mirrored into the npm MCP compatibility package. */
export const SKILL_ACCOUNT_GUIDE = {
  /** @deprecated Compatibility alias for existing integrations; new connections use connection.setupUrl and OAuth. */
  apiKeysUrl: 'https://www.meigen.ai/profile/api-keys',
  apiKeysUrlDeprecated: true,
  topUpUrl: 'https://www.meigen.ai/profile',
  mobileTopUpUrl: 'https://www.meigen.ai/m/premium',
  pricingUrl: 'https://www.meigen.ai/model-comparison',
  connection: { remoteUrl: 'https://www.meigen.ai/api/mcp', authentication: 'OAuth account sign-in', setupUrl: 'https://www.meigen.ai/mcp' },
  legacyCompatibility: { existingIntegrationsOnly: true, apiKeysUrl: 'https://www.meigen.ai/profile/api-keys', remoteHeader: 'Authorization: Bearer <existing MeiGen API key>', localCommand: 'npx', localArgs: ['-y', 'meigen@3.0.0'], localTokenEnv: 'MEIGEN_API_TOKEN', privateLibrary: false },
  authentication: 'Connect https://www.meigen.ai/api/mcp through the host OAuth sign-in and consent flow for a new MeiGen connection. API keys are retained only for existing legacy integrations: local npm uses an existing MEIGEN_API_TOKEN, and legacy remote HTTP uses Authorization: Bearer <key> in private connection settings. Local npm does not implement OAuth or private library access. Reconnect after updating the connection. Never request the secret in chat or put it in a URL. An npm publishing token is not a MeiGen credential.',
  credits: 'Use the connected MeiGen account (the key-owning account for an existing legacy integration). On Profile choose Top Up; on mobile use the premium page. Purchase credits there, then return to the MCP conversation. API calls use purchased credits only, including the first background removal; daily free credits and Web free attempts are unavailable through the API. The model pricing page lists costs; it is not the checkout page.',
} as const

export const SKILL_TOOLS = {
  upscale: { name: 'upscale_image', title: 'Enhance image clarity', description: 'Enhance one still image. Crisp preserves structure; creative regenerates detail for blurry images. Pass the original public URL directly, including external URLs; avoid generic reference-image resizing. The shared backend prepares the image. Inputs above 4096px or 16 MP require acceptance of resizing; the output may be smaller than the original. Source safety cap: 64 MiB / 64 MP. Video enhancement is not exposed through this API.', materials: { required: ['One original PNG, JPEG or WebP image'], optional: ['Crisp or creative mode'], tips: 'Large pixel dimensions do not imply sharp detail. Explain the resizing warning when returned; do not silently accept it or repeatedly retry.' }, example: 'Improve the clarity of this blurry photo using creative enhancement.' },
  'remove-bg': { name: 'remove_background', title: 'Remove background', description: 'Create one transparent PNG cutout for compositing, catalog assets or logos. Required: one actual source photo containing the subject. No prompt or product facts needed. This removes the background; it does not create a new scene.', materials: { required: ['One source image with a clearly visible subject'], optional: [], tips: 'Use an in-focus image with the whole subject visible.' }, example: 'Remove the background from this photo and give me a transparent PNG.' },
  'product-detail': { name: 'generate_product_detail_images', title: 'Product Detail Images', description: 'Create 1–6 coordinated ecommerce listing images. Required: one actual product photo and a resolved image count. Product name, verified selling points, logo, model photo and extra angles are optional. Each module creates one paid image. If only the count is specified, choose suitable modules; MCP calls must explicitly select modules to match that count.', materials: { required: ['One product photo showing its shape, color and packaging'], optional: ['Product name and verified selling points', 'Logo, model photo or additional product angles'], tips: 'Keep labels readable. Do not invent material, certifications, specifications or benefits. Resolve the output count before a paid batch.' }, example: 'Make two listing images from this product photo: a hero shot and a detail close-up.' },
  'brand-poster': { name: 'generate_marketing_poster', title: 'Marketing Poster', description: 'Design one poster for a brand, shop, event, promotion or topic. Required: only the subject. An image is not required. Exact wording, dates, offers, logo, product photos and style references are optional. Keep supplied copy with autoCopy=false; never invent event details or offers. The service plans the layout and writes the prompt.', materials: { required: ['Brand, shop, event or topic'], optional: ['Exact copy and confirmed event details', 'Logo, up to three product photos or a style reference'], tips: 'A subject-only poster is supported. Ask for an exact date or price only if the user wants it printed and has not supplied it.' }, example: 'Create a weekend event poster for my coffee shop; use only the wording I provide.' },
  'white-bg': { name: 'generate_ai_background', title: 'AI Backgrounds', description: 'Create one product photo with a new background. Required: one actual product photo. White mode produces a fixed white background; smart chooses a scene; custom needs a background description, inferred from the request when present (e.g. a beach). Background references are not required. Use remove_background for transparent PNG cutouts.', materials: { required: ['One product photo', 'For custom mode: the requested scene or background in words'], optional: [], tips: 'White = catalog background; smart = automatic scene; custom = your scene. Preserve the product, with no need to pre-remove its background.' }, example: 'Keep this product and replace its background with a sunlit beach.' },
} as const

export type GuidedSkill = keyof typeof SKILL_TOOLS
export const SKILL_POLL_SECONDS = 10
export const SKILL_FLOW = 'Use the dedicated skill directly; skip unrequested prompt enhancement, preference loading and delegation. Preserve caller-supplied inputs. Infer omitted optional settings from the request and defaults; when only a requested count is known, choose suitable modules unless the caller selected them. Ask only for missing required material or unresolved scope. An explicit user request or authorized upstream workflow establishes its count, quality and budget: do not reconfirm that scope or add paid images. The caller persists a requestId for each logical step; never ask an end user for technical IDs. Use live list_skills prices and account for in-flight charges when planning within a budget; a batch is not atomic and an estimate is not a server-enforced spending cap. Recovery actions take precedence over generic retry advice: check an interrupted submission, preserve exact retryParameters and do not create a new ID or replace failed modules automatically. Retry a temporary upload at most once after the suggested wait. Return structured status, handles, errors and completed URLs to the caller; it owns progress, previews, downloads and final presentation. If interacting directly with the user, explain the problem and a concrete next step in their language. Describe image details only after actual inspection.'

interface Action {
  type: string
  message: string
  tool?: string
  arguments?: Record<string, unknown>
  afterSeconds?: number
  url?: string
}

/** Keep failure advice specific: auth/payment/input rejection must never tell the model to poll. */
export function skillNextAction(body: Record<string, unknown>, httpStatus: number, phase: 'submit' | 'status', skill?: GuidedSkill, requestId?: string): Action {
  const request = { skill: body.skill ?? skill, requestId: body.requestId ?? requestId }
  const check = (message: string, afterSeconds = SKILL_POLL_SECONDS): Action => ({ type: 'check_status', tool: 'check_skill', arguments: request, afterSeconds, message })
  if (body.code === 'request_id_collision') return { type: 'new_request_id', message: 'This ID is reserved by another feature. No Skill job was started for this request. Generate a new requestId and submit the same intended inputs; do not poll this rejected ID.' }
  if (body.code === 'generation_unavailable') return { type: 'review_missing', message: 'The original request was accepted, but its saved generation records are no longer available. Stop polling and preserve the original requestId and job IDs for review. Missing records do not prove a refund or an unsubmitted request; do not resubmit or create a paid replacement automatically.' }
  if (phase === 'status' && httpStatus === 200 && (body.status === 'failed' || body.submissionHttpStatus === 429) &&
    typeof body.submissionHttpStatus === 'number' && body.submissionHttpStatus >= 400 && body.submissionHttpStatus < 500 && body.submission && typeof body.submission === 'object') {
    if (body.submissionHttpStatus === 409 && body.submission && ['upscale_resize_required', 'price_changed'].includes(String((body.submission as Record<string, unknown>).code))) return skillNextAction({ ...body.submission, ...request, batchId: body.batchId }, 409, 'submit', skill, requestId)
    if (body.submissionHttpStatus === 409) return { type: 'verify_request', message: 'The saved request ended in an input or billing-context conflict. Explain the conflict and verify the original request and any existing results. Stop polling; do not create a paid replacement automatically.' }
    return skillNextAction({ ...body.submission, ...request, batchId: body.batchId }, body.submissionHttpStatus, 'submit', skill, requestId)
  }
  if (body.code === 'upscale_resize_required') return { type: 'confirm_resize', message: 'No generation has started or been charged. Explain that this large image must be resized before enhancement, the result may be smaller than the original and clarity gains may be limited. Return the resize tradeoff to the caller for acceptance unless it was already accepted in the authorized workflow. After acceptance submit the same source and mode with allowDownscale=true and a new requestId; do not poll this rejected request.' }
  if (body.code === 'price_changed') return { type: 'confirm_price', message: 'No generation has started or been charged. Return the updated quotedCredits to the caller and obtain acceptance if outside the already authorized price before submitting a new requestId with the accepted confirmedCredits. Stop polling this rejected request.' }
  if (httpStatus === 401 || httpStatus === 403) return { type: 'configure_auth', url: SKILL_ACCOUNT_GUIDE.connection.setupUrl, message: `${SKILL_ACCOUNT_GUIDE.authentication} For an invalid/expired/revoked legacy key, check the existing integration privately or switch the host to remote OAuth. Explain only the setup steps relevant to this host. Do not poll this rejected call.` }
  if (httpStatus === 402) return { type: 'top_up', url: SKILL_ACCOUNT_GUIDE.topUpUrl, message: `Explain the purchased-credit shortfall using required/available if supplied. ${SKILL_ACCOUNT_GUIDE.credits} Mobile checkout: ${SKILL_ACCOUNT_GUIDE.mobileTopUpUrl}. After top-up, continue only within the caller's authorized scope, with a new requestId; do not poll this rejected call.` }
  if ([400, 413, 422].includes(httpStatus)) return { type: 'fix_input', message: `Explain the invalid field or image limit and correct it from known context; ask only for information that is missing. Do not poll. ${body.batchId ? 'This rejected request has a receipt; use a new requestId after correcting the inputs.' : 'No request was accepted; keep the requestId while correcting inputs.'}` }
  if (httpStatus === 429) return { type: 'wait_for_limit', ...(body.code === 'DAILY_LIMIT_REACHED' ? {} : { afterSeconds: 60 }), message: body.code === 'DAILY_LIMIT_REACHED' ? 'The daily request limit has been reached. Explain this and stop retrying until the limit resets; it is not a balance shortage.' : 'The service is rate-limited. Wait before retrying the same requestId and inputs; do not create a new paid request.' }
  if (body.code === 'idempotency_conflict') return check('The ID already belongs to another input or billing context. Recover the original request first. Do not generate a new ID automatically.', 0)
  if (phase === 'status' && httpStatus === 404) return { type: 'verify_request', message: 'No receipt exists for this key, skill and requestId. Verify those values. If this was an interrupted first submission, retry the original requestId and original inputs; do not invent a new paid attempt.' }
  if (httpStatus >= 500 || body.code === 'request_interrupted') return check(phase === 'status' ? 'Status is temporarily unavailable. Retry check_skill after the suggested interval; do not submit again.' : 'Submission may have started. Check the original request before deciding whether to retry; a new ID may charge again.')
  if (body.retryable === true) {
    return body.retryParameters && typeof body.retryParameters === 'object' && skill
      ? { type: 'retry_request', tool: SKILL_TOOLS[skill].name, arguments: body.retryParameters as Record<string, unknown>, message: 'Recover using these exact parameters and uploaded URLs. Do not re-upload the image or change requestId.' }
      : check('Check the original request to obtain its exact retry parameters.')
  }
  if (body.status === 'processing' || body.code === 'in_progress') return check('Still processing. Return this state to the caller and wait before checking again. Do not resubmit or claim completion.')
  if (body.status === 'completed' || body.status === 'partial' || typeof body.imageUrl === 'string') return { type: 'show_results', message: body.status === 'partial' ? 'Return each completed image URL with its module label and separate missing/failed modules to the caller. Report refunds only as indicated by creditsStatus. The caller owns presentation; do not automatically generate replacements.' : 'Return completed image URLs, task handles and status to the caller. It decides whether to preview, download or present them. Describe image details only after actual inspection.' }
  if (body.status === 'failed' || body.success === false) return { type: 'explain_failure', message: 'Explain the returned error and refund status without claiming a refund before confirmation. Stop polling. A fresh paid attempt requires user intent to try again.' }
  const items = Array.isArray(body.items) ? body.items as Array<{ generationId?: unknown }> : []
  if (body.generationId || items.some((item) => item.generationId)) return check('Jobs were submitted, not completed. Wait before checking for results. Do not create another request.')
  return { type: 'explain_failure', message: 'No completed image or accepted job was returned. Explain the module errors; do not poll indefinitely or automatically create a paid replacement.' }
}

/** Links are actual result URLs only, never prompt/reference URLs or unfinished outputs. */
export function skillOutputLinks(body: Record<string, unknown>) {
  const links: Array<{ type: 'resource_link'; uri: string; name: string; description: string; mimeType?: string }> = []
  const add = (url: unknown, name: string) => {
    if (typeof url !== 'string' || links.some((link) => link.uri === url)) return
    let parsed: URL
    try { parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return } catch { return }
    const extension = parsed.pathname.split('.').pop()?.toLowerCase() ?? ''
    const mimeType = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif' } as Record<string, string>)[extension]
    links.push({ type: 'resource_link', uri: url, name, description: 'Completed image: preview or download.', ...(mimeType ? { mimeType } : {}) })
  }
  add(body.imageUrl, 'Result image')
  if (Array.isArray(body.items)) for (const item of body.items as Array<Record<string, unknown>>) {
    if (item.status === 'completed' && Array.isArray(item.imageUrls)) {
      for (const [index, url] of item.imageUrls.entries()) add(url, `${item.module || 'Result'} ${index + 1}`)
    }
  }
  const submission = body.submission as Record<string, unknown> | undefined
  if (body.status === 'completed') add(submission?.imageUrl, 'Result image')
  return links
}

export function skillToolResult(body: Record<string, unknown>, httpStatus: number, phase: 'submit' | 'status', skill?: GuidedSkill, requestId?: string) {
  const nextAction = skillNextAction(body, httpStatus, phase, skill, requestId)
  const structuredContent = { ...body, nextAction }
  return { structuredContent, content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }, ...skillOutputLinks(body)],
    ...(httpStatus >= 400 || body.success === false || body.status === 'failed' ? { isError: true } : {}) }
}

export function skillUploadResult(body: Record<string, unknown>, httpStatus: number) {
  const nextAction: Action = httpStatus === 402
    ? { type: 'top_up', url: SKILL_ACCOUNT_GUIDE.topUpUrl, message: `${SKILL_ACCOUNT_GUIDE.credits} After top-up retry the same upload. No generation was submitted or charged; do not call check_skill.` }
    : httpStatus === 401 || httpStatus === 403
    ? skillNextAction(body, httpStatus, 'submit')
    : httpStatus === 429
      ? { type: 'wait_for_limit', message: 'Wait for the upload limit to reset. No generation has started; do not call check_skill.' }
      : httpStatus >= 500
        ? { type: 'retry_upload', afterSeconds: 10, message: 'Image preparation is temporarily unavailable. Retry the same upload once after waiting. If it still fails, explain that and offer an accessible direct image link or the local npm file-upload route. No generation was submitted or charged; do not call check_skill.' }
        : httpStatus >= 400 || body.success !== true
          ? { type: 'prepare_image', message: 'Explain the specific upload error and one suitable fix: for oversized base64, use a public direct HTTPS image URL (at most 8 MiB reference source, 64 MiB with purpose=upscale); base64 is limited to 3 MiB decoded; for invalid/private/redirecting links, use the actual public image file, not a webpage or login link; for unreadable attachments, offer a direct image URL or local npm file upload. Prefer PNG/WebP when transparency matters. Never ask the user to type base64 or invent attachment paths. No generation has started; do not call check_skill.' }
          : { type: 'use_image', message: 'Use imageUrl in the selected Skill and preserve it for retries. The source is ready; no generation has started. For Upscale, preserve original dimensions by uploading with purpose=upscale; public originals can go directly to upscale_image.' }
  const structuredContent = { ...body, nextAction }
  return { structuredContent, content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }],
    ...(httpStatus >= 400 || body.success !== true ? { isError: true } : {}) }
}
