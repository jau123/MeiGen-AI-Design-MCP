import { z } from 'zod'
import { unsafeReferenceUrlReason } from './url-safety.js'

function originalImageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.port && !(unsafeReferenceUrlReason(value) !== null)
  } catch { return false }
}

const annotationSchema = z.object({
  url: z.string().max(4096).url().refine(originalImageUrl, 'Use a direct public HTTPS original PNG URL without credentials, fragments or custom ports.'),
  width: z.number().int().positive(), height: z.number().int().positive(),
}).strict()
export const imageMaskSchema = annotationSchema.refine(value => value.width * value.height <= 36_000_000, 'Mask exceeds 36 million pixels.')
export const imageMarkupSchema = annotationSchema.refine(value => value.width * value.height <= 16_777_216, 'Markup exceeds 16,777,216 pixels.')
export type ImageEditAnnotation = z.infer<typeof annotationSchema>

interface AnnotatedImageInput {
  modelId?: string
  outputFormat?: string
  referenceImages?: string[]
  imageMask?: ImageEditAnnotation
  imageMarkup?: ImageEditAnnotation
}

/** Reject incompatible edits before upload or a billable request. Missing fields preserve legacy calls. */
export function imageEditInputError(input: AnnotatedImageInput): string | undefined {
  if (input.imageMask === undefined && input.imageMarkup === undefined) return undefined
  if (input.imageMask !== undefined && input.imageMarkup !== undefined) return 'Use imageMask or imageMarkup, never both.'
  if (!['gpt-image-2.5', 'gpt-image-2.6'].includes(input.modelId ?? '') || ['gif', 'svg'].includes(input.outputFormat ?? '')) {
    return 'Annotated edits require an explicit compatible GPT Image still-image model from list_models; GIF and SVG do not support masks or markup.'
  }
  if (!input.referenceImages?.[0] || !originalImageUrl(input.referenceImages[0])) {
    return 'Put the original source image first in referenceImages as a public HTTPS URL. Local annotated source images are unsupported because ordinary uploads may resize them.'
  }
  const valid = input.imageMask !== undefined ? imageMaskSchema.safeParse(input.imageMask) : imageMarkupSchema.safeParse(input.imageMarkup)
  if (!valid.success) return 'Use a public HTTPS PNG annotation URL and positive exact source dimensions within the model pixel limit.'
  return undefined
}

export const imageEditDescription = ' For an annotated still-image edit, read list_models imageOutput.editing first. Use imageMask for transparent editable pixels or imageMarkup for visible colored annotations on a transparent PNG. Supply exactly one, with width/height matching the original source in referenceImages[0]; source and annotation must be public HTTPS URLs, at original dimensions, and the PNG must be at most 10 MiB. Local annotated source paths are rejected to prevent resizing. Markup requires the official OpenAI route and visible annotation pixels. Never flatten markup into the source, drop a selection, or use GIF/SVG or saved characters for these requests. Preserve the same annotation URL and dimensions on recovery.'
