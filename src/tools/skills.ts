import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import type { MeiGenConfig } from '../config.js'
import { ImageUploadError, processAndUploadSkillImage, processAndUploadUpscaleImage } from '../lib/upload.js'
import { abortReason, boundedJson, withHttpResponse } from '../lib/generation-http.js'
import { SKILL_FLOW, SKILL_TOOLS, skillToolResult, skillUploadResult } from '../lib/skill-guidance.js'

const SKILLS = ['remove-bg', 'brand-poster', 'product-detail', 'white-bg', 'upscale'] as const
type Skill = typeof SKILLS[number]
const image = z.string().min(1).describe('An accessible absolute local path (Windows drive/UNC, POSIX, ~/, or file://) or public direct HTTPS image URL without credentials, fragments or custom ports. Relative paths are ambiguous and rejected. Files are fully decoded, metadata removed, transparency preserved; GIF uses the first frame. Never invent attachment paths or URLs.')
const referenceImage = (role: string) => image.describe(`${role} ${image.description}`)
const requestId = z.string().uuid().describe('Generate a new UUID for a new paid request; reuse the SAME requestId and inputs on retry. Use check_skill after interruptions.')
const language = z.string().optional().describe('Copy language, e.g. auto, en, zh; see list_skills for supported values')
const quality = z.enum(['low', 'medium']).optional().describe('low=Fast (default); medium=Pro. These select rendering quality, not output resolution. Read list_skills for current output specifications and purchased-credit prices; no fixed completion time is guaranteed.')
const tools = {
  upscale: { name: 'upscale_image', schema: {
    requestId, imageUrl: image.describe('Original still PNG/JPEG/WebP: absolute local path, ~/, file://, or public direct HTTPS URL. Maximum 64 MiB/64 million pixels. Local uploads remove metadata, preserve alpha and dimensions, and compress below the gateway limit; if that fails, provide a public original URL. The backend asks before any resizing.'),
    mode: z.enum(['crisp', 'creative']).default('crisp').describe('crisp=faithful enhancement (default); creative=AI reconstructs details and may change them. Use creative only when the user accepts those changes.'),
    allowDownscale: z.boolean().default(false).describe('True only after the user accepts resizing a large source and potentially receiving a smaller result. On upscale_resize_required, no charge occurred; after acceptance use a new requestId.'),
    confirmedCredits: z.number().int().nonnegative().describe('Required on every MCP submission, including the first: current list_skills quote within the user or upstream workflow accepted budget. Reuse explicit acceptance. On price_changed, accept the updated quote before a new requestId. This pre-dispatch check is not an atomic spending cap.'),
  } },
  'remove-bg': { name: 'remove_background', schema: { requestId, productImage: referenceImage('Required source containing the subject to cut out; the subject may be a product, person or logo. The output has a transparent background.') } },
  'brand-poster': { name: 'generate_marketing_poster', schema: {
    requestId, brand: z.string().min(1).max(60).describe('Poster subject: brand, event, shop, campaign or topic.'), content: z.string().max(500).optional().describe('Poster brief when autoCopy=true; exact visible wording when autoCopy=false (the selected language may translate it). Put style, layout and design directions in extraNotes or customStyle, not in verbatim content.'), autoCopy: z.boolean().optional().describe('Default true: compose copy from the brief. False: use supplied wording faithfully; selected language may translate it.'),
    extraNotes: z.string().max(500).optional().describe('Additional verified facts, explicitly requested display copy, or layout/design constraints, up to 500 characters. Treat design instructions as directions, not text to print verbatim. Preserve supplied details; do not invent dates, prices, offers or claims.'), ratio: z.string().optional().describe('Supported output ratio from list_skills for this Skill; omit for its default.'), language, quality, uiLocale: z.string().max(35).optional().describe('Optional UI locale fallback; language controls the text inside images.'),
    logo: referenceImage('Optional exact brand logo to reproduce accurately, not a style reference.').optional(),
    productImages: z.array(referenceImage('Product identity reference: preserve its design, color and branding.')).max(3).optional().describe('Optional product/subject photos, up to three; these identify what the poster depicts, not its visual style.'),
    styleImage: referenceImage('Optional PRIMARY visual-style reference: palette, lighting, typography and mood. Do not copy its content, products, text or layout; written style is only a compatible supplement.').optional(),
    styleId: z.string().optional().describe('Preset ID, not its display label; choose from list_skills style options. Omit styleId and customStyle for Auto. Nonempty customStyle overrides this preset.'),
    customStyle: z.string().max(200).optional().describe('Optional written visual direction, up to 200 characters. Nonempty text overrides styleId; omit both for Auto. If styleImage is supplied, supplement its visual style without conflicting with it.'),
  } },
  'product-detail': { name: 'generate_product_detail_images', schema: {
    requestId, productImage: referenceImage('Required main product photo: preserve the actual shape, color, packaging and readable labels.'), productName: z.string().max(200).optional().describe('Optional supplied product name; do not invent a brand or model.'), sellingPoints: z.string().max(2000).optional().describe('Optional verified benefits or specifications from the caller; do not invent product claims.'), autoCopy: z.boolean().optional().describe('Default true: draft copy from the supplied product brief. False: preserve supplied wording, subject to the selected-language translation.'),
    modules: z.array(z.enum(['hero', 'detail', 'scene', 'material', 'usage', 'brand'])).max(6).describe('Required selection; one paid image each: hero=main shot, detail=close-up, scene=lifestyle, material=texture/craft, usage=how to use, brand=brand story. Set [] for custom modules only; otherwise select modules explicitly. Match the requested count.'),
    customModules: z.array(z.object({ name: z.string().trim().min(1).max(40), description: z.string().trim().min(1).max(500) })).max(6).optional(),
    platform: z.string().optional().describe('Marketplace preset from list_skills; default amazon.'), language, quality, uiLocale: z.string().max(35).optional().describe('Optional UI locale fallback; language controls the text inside images.'), extraRequirements: z.string().max(500).optional().describe('Optional additional copy, layout or product presentation requirements from the caller; preserve factual constraints.'),
    aspectRatio: z.string().optional().describe('Supported output ratio from list_skills; default 4:5.'), modelImage: referenceImage('Optional person/model reference for hero and scene modules: show that person wearing or using the product. Not an image-generation model identifier.').optional(),
    logo: referenceImage('Optional exact brand logo to reproduce accurately.').optional(), extraProductImages: z.array(referenceImage('Additional view of the same product; preserve its identity and details.')).max(2).optional().describe('Optional extra product angles or detail photos, up to two; these supplement the main productImage.'),
  } },
  'white-bg': { name: 'generate_ai_background', schema: {
    requestId, productImage: referenceImage('Required product photo: preserve the product while replacing its surroundings. Do not pre-remove its background.'), mode: z.enum(['white', 'smart', 'custom']).optional().describe('white=fixed white-background output; smart=AI chooses a suitable scene (default); custom=customPrompt required.'), customPrompt: z.string().max(300).optional().describe('Required in custom mode: describe the desired background and lighting.'),
    ratio: z.string().optional().describe('Supported output ratio from list_skills for this Skill; omit for its default. Smart/custom only; auto matches source proportions. Ignored in white mode.'), quality: z.enum(['fast', 'hd']).optional().describe('Smart/custom only: fast=1K default, hd=2K; ignored in white mode.'),
  } },
} as const

class ImagePreparationError extends Error {
  constructor(public body: Record<string, unknown>, public status: number) { super(String(body.error ?? 'Image preparation failed')) }
}
async function uploadRemote(input: Record<string, unknown>, config: MeiGenConfig, signal?: AbortSignal): Promise<Record<string, unknown>> {
  try {
    return await withHttpResponse(`${config.meigenBaseUrl.replace(/\/$/, '')}/api/skills/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.meigenApiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }, 130_000, async response => {
      const body = await boundedJson(response)
      abortReason(signal)
      if (!response.ok || body.success !== true || typeof body.imageUrl !== 'string') throw new ImagePreparationError(body, response.status >= 400 ? response.status : 503)
      if (!allowedSkillImageUrl(body.imageUrl)) throw new ImagePreparationError({ success: false, error: 'Image preparation returned an unsupported image URL. Retry the upload.' }, 503)
      return body
    }, signal)
  } catch (error) {
    abortReason(signal)
    if (error instanceof ImagePreparationError) throw error
    throw new ImagePreparationError({ success: false, error: 'Image preparation is temporarily unavailable.' }, 503)
  }
}

function cancelledResult(skill?: Skill, requestId?: string, submitted = false) {
  if (submitted) return skillToolResult({ success: false, skill, requestId, code: 'request_interrupted', cancelled: true,
    error: 'Cancelled after submission began. The server may have accepted a paid job. Keep the original requestId and check its status before any retry.' }, 503, 'submit', skill, requestId)
  const structuredContent = { success: false, code: 'cancelled', ...(skill ? { skill } : {}), ...(requestId ? { requestId } : {}),
    error: 'Operation cancelled. No new paid generation was submitted by this call.',
    nextAction: { type: 'cancelled', message: 'Stop this call. Preserve any existing requestId; cancellation does not cancel or refund jobs already accepted by the server.' } }
  return { structuredContent, content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }], isError: true }
}

export function allowedSkillImageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash &&
      ['images.meigen.ai', 'images.meigen.art', 'pbs.twimg.com'].includes(url.hostname)
  } catch { return false }
}

/** Classify before opening files: a Windows drive letter is not a URL scheme. */
export function classifySkillImageSource(value: string): { kind: 'local'; path: string } | { kind: 'remote'; url: string } {
  if (/^\\\\[?.]\\/.test(value)) throw new Error('Device paths are unsupported. Provide a regular image file.')
  if (/^[a-z]:[/\\]/i.test(value) || /^\\\\[^\\]+\\[^\\]+/.test(value) || value.startsWith('/')) return { kind: 'local', path: value }
  if (value.startsWith('~/')) return { kind: 'local', path: `${homedir()}/${value.slice(2)}` }
  if (/^file:\/\//i.test(value)) {
    const url = new URL(value)
    if (url.username || url.password || url.search || url.hash) throw new Error('Use a file:// image URL without credentials, query or fragment.')
    return { kind: 'local', path: fileURLToPath(url) }
  }
  if (/^https:\/\//i.test(value)) {
    const url = new URL(value)
    if (url.username || url.password || url.port || url.hash) throw new Error('Use a public direct HTTPS image URL without credentials, fragments or nonstandard ports.')
    return { kind: 'remote', url: url.toString() }
  }
  throw new Error('Use an accessible absolute image path, ~/, file://, or public direct HTTPS image URL. Relative paths are ambiguous; do not guess the MCP process working directory.')
}

async function resolveImage(value: string, config: MeiGenConfig, signal?: AbortSignal): Promise<string> {
  abortReason(signal)
  const source = classifySkillImageSource(value)
  const url = source.kind === 'remote' ? source.url : await processAndUploadSkillImage(source.path, config, { signal })
  if (allowedSkillImageUrl(url)) return url
  // Custom upload gateways may return their own CDN. Prepare it under the same API image contract.
  const prepared = classifySkillImageSource(url)
  if (prepared.kind !== 'remote') throw new ImageUploadError('Upload gateway returned an unsupported image URL. Check the gateway configuration.', 503)
  return String((await uploadRemote({ sourceUrl: prepared.url, purpose: 'reference' }, config, signal)).imageUrl)
}

export async function resolveSkillImages(input: Record<string, unknown>, config: MeiGenConfig, skill?: Skill, signal?: AbortSignal) {
  abortReason(signal)
  const body = { ...input }
  if (skill === 'upscale' && typeof body.imageUrl === 'string') {
    const source = classifySkillImageSource(body.imageUrl)
    const url = source.kind === 'remote' ? source.url : await processAndUploadUpscaleImage(source.path, config, signal)
    const uploaded = classifySkillImageSource(url)
    if (uploaded.kind !== 'remote') throw new ImageUploadError('Upload gateway returned an unsupported original-image URL.', 503)
    // Server validates public DNS and prepares any public CDN source; never resize via generic reference upload.
    body.imageUrl = uploaded.url
    return body
  }
  for (const key of ['productImage', 'logo', 'modelImage', 'styleImage']) {
    if (typeof body[key] === 'string') body[key] = await resolveImage(body[key] as string, config, signal)
  }
  for (const key of ['productImages', 'extraProductImages']) {
    if (Array.isArray(body[key])) {
      const urls: string[] = []
      for (const source of body[key] as string[]) urls.push(await resolveImage(source, config, signal))
      body[key] = urls
    }
  }
  return body
}

function result(body: Record<string, unknown>, isError = false, guidance = '') {
  return { content: [{ type: 'text' as const, text: `${JSON.stringify(body)}${guidance ? `\n${guidance}` : ''}` }], ...(isError ? { isError: true } : {}) }
}

export function registerSkillTools(server: McpServer, config: MeiGenConfig) {
  const site = config.meigenBaseUrl.replace(/\/$/, '')
  const auth = () => config.meigenApiToken ? { Authorization: `Bearer ${config.meigenApiToken}` } : undefined
  server.tool('list_skills', 'Choose a Skill by use case and required materials; read account setup, top-up instructions, live prices and upload options. Set skill to inspect one workflow. Returned inputSchema is the HTTP API schema; this local MCP also accepts actual file paths and external HTTPS image URLs using its tool schemas.', { skill: z.enum(SKILLS).optional() }, { readOnlyHint: true }, async ({ skill }: { skill?: Skill }, extra?: { signal?: AbortSignal }) => {
    try {
      return await withHttpResponse(`${site}/api/skills${skill ? `?skill=${skill}` : ''}`, {}, 10_000, async response => {
        const body = await boundedJson(response)
        return result(body, !response.ok || body.success !== true)
      }, extra?.signal)
    } catch { if (extra?.signal?.aborted) return cancelledResult(); return result({ success: false, error: 'Skill capabilities unavailable; retry shortly.' }, true) }
  })

  server.tool('upload_skill_image', 'Prepare a reference image and return imageUrl. External URLs and local file paths can also be passed directly to the generation skill. Use actual accessible bytes/URLs only; never fabricate base64 or attachment paths. No generation is started.', {
    purpose: z.enum(['reference', 'upscale']).default('reference').describe('Use upscale for enhancement attachments: preserves source dimensions until the backend asks for resizing acceptance.'),
    sourceUrl: z.string().url().max(4096).optional().describe('Actual public direct HTTPS image URL to prepare; choose either sourceUrl or imageBase64. Local paths go directly to a generation Skill image field, not this URL field.'),
    imageBase64: z.string().max(4 * 1024 * 1024).optional().describe('Actual raw base64 image bytes, max 3 MiB decoded. Exactly one input is required.'),
  }, { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }, async (args: { sourceUrl?: string; imageBase64?: string; purpose?: 'reference' | 'upscale' }, extra?: { signal?: AbortSignal }) => {
    if (extra?.signal?.aborted) return cancelledResult()
    if (!auth()) return skillUploadResult({ success: false, error: 'MEIGEN_API_TOKEN is required.' }, 401)
    if (Boolean(args.sourceUrl) === Boolean(args.imageBase64)) return skillUploadResult({ success: false, error: 'Provide exactly one of sourceUrl or actual imageBase64 bytes.', code: 'invalid_input' }, 400)
    if (args.sourceUrl) {
      try {
        const source = classifySkillImageSource(args.sourceUrl)
        if (source.kind !== 'remote') return skillUploadResult({ success: false, error: 'sourceUrl must be a public direct HTTPS image URL. Pass an absolute local path directly to the selected Skill instead.', code: 'invalid_input' }, 400)
      } catch (error) { return skillUploadResult({ success: false, error: error instanceof Error ? error.message : 'Invalid image source.', code: 'invalid_input' }, 400) }
    }
    try { return skillUploadResult(await uploadRemote(args, config, extra?.signal), 200) }
    catch (error) { if (extra?.signal?.aborted) return cancelledResult(); return error instanceof ImagePreparationError ? skillUploadResult(error.body, error.status) : skillUploadResult({ success: false, error: 'Image preparation failed.' }, 503) }
  })

  for (const skill of SKILLS) {
    const tool = tools[skill]
    server.tool(tool.name, `${SKILL_TOOLS[skill].description} This legacy local npm path requires an existing MeiGen key (MEIGEN_API_TOKEN or saved local configuration) and purchased credits. New connections use remote OAuth at https://www.meigen.ai/api/mcp. Local files and external public HTTPS URLs are uploaded automatically. ${SKILL_FLOW}`, tool.schema, { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      async (args: Record<string, unknown>, extra?: { signal?: AbortSignal }) => {
        const signal = extra?.signal
        if (signal?.aborted) return cancelledResult(skill, String(args.requestId))
        const headers = auth()
        if (!headers) return skillToolResult({ success: false, error: 'This legacy local Skill path needs its existing MEIGEN_API_TOKEN. New connections should sign in through remote OAuth at https://www.meigen.ai/api/mcp.' }, 401, 'submit', skill, String(args.requestId))
        let submitted = false
        try {
          const body = await resolveSkillImages(args, config, skill, signal)
          abortReason(signal)
          submitted = true
          return await withHttpResponse(`${site}/api/skills/${skill}/run`, {
            method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }, 130_000, async response => {
            const output = await boundedJson(response)
            abortReason(signal)
            return skillToolResult(output, response.status, 'submit', skill, String(args.requestId))
          }, signal)
        } catch (error) {
          if (signal?.aborted) return cancelledResult(skill, String(args.requestId), submitted)
          if (error instanceof ImagePreparationError) return skillUploadResult(error.body, error.status)
          if (error instanceof ImageUploadError) {
            // This gateway does not authenticate MeiGen keys; a storage 403 means upload failure, not invalid account credentials.
            const status = [400, 413, 422, 429].includes(error.status) ? error.status : 503
            return skillUploadResult({ success: false, error: error.message }, status)
          }
          const body = { success: false, skill, requestId: args.requestId, error: error instanceof Error ? error.message : 'Request failed' }
          return submitted ? skillToolResult({ ...body, code: 'request_interrupted' }, 503, 'submit', skill, String(args.requestId)) : skillUploadResult(body, 400)
        }
      })
  }
  server.tool('check_skill', 'Read all skill images, partial failures and refund states. No new charges. Follow nextAction: wait afterSeconds before polling (normally 10s); recover only when it says retry_request, with its exact parameters. Payment/auth/input failures and daily limits require the indicated action instead of polling. Show completed resource links.', {
    skill: z.enum(SKILLS), requestId: z.string().uuid(),
  }, { readOnlyHint: false, destructiveHint: false, idempotentHint: true }, async ({ skill, requestId }: { skill: Skill; requestId: string }, extra?: { signal?: AbortSignal }) => {
    if (extra?.signal?.aborted) return cancelledResult(skill, requestId)
    const headers = auth()
    if (!headers) return skillToolResult({ success: false, error: 'MEIGEN_API_TOKEN is required.' }, 401, 'status', skill, requestId)
    try {
      const params = new URLSearchParams({ skill, requestId })
      return await withHttpResponse(`${site}/api/skills/status?${params}`, { headers }, 15_000, async response => {
        const body = await boundedJson(response)
        abortReason(extra?.signal)
        return skillToolResult(body, response.status, 'status', skill, requestId)
      }, extra?.signal)
    } catch { if (extra?.signal?.aborted) return cancelledResult(skill, requestId); return skillToolResult({ success: false, skill, requestId, error: 'Status unavailable.' }, 503, 'status', skill, requestId) }
  })
}
