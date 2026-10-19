import { z } from 'zod'

/** Keep the additive Web/App niji7Options contract; no defaults in request identity. */
export const midjourneyOptionsSchema = z.object({
  stylize: z.number().min(0).max(1000).optional(),
  chaos: z.number().min(0).max(100).optional(),
  weird: z.number().min(0).max(3000).optional().describe('V7/Niji only; ignored by V8.2.'),
  raw: z.boolean().optional(),
  iw: z.number().min(0).max(3).optional().describe('Content image weight; Niji supports at most 2.'),
  sref: z.string().min(1).max(4096).refine(value => {
    const tokens = value.replace(/[,，](?=https?:\/\/)/gi, ' ').trim().split(/\s+/)
      .flatMap(token => /^https?:\/\//i.test(token) ? [token] : token.split(/[,，]+/)).filter(Boolean)
    return tokens.length > 0 && tokens.every(token => {
      if (/^(?:\d+|random)$/i.test(token)) return true
      try { const url = new URL(token); return url.protocol === 'https:' && !url.username && !url.password && !url.hash } catch { return false }
    })
  }, 'Use numeric style codes, random, or public HTTPS image URLs; use referenceImages for local files.').optional(),
  sw: z.number().min(0).max(1000).optional(),
  sv: z.number().int().min(1).max(6).optional().describe('Legacy style version; V8.2 always uses 6.'),
  quality: z.enum(['1', '4']).optional().describe('MJ V8.2 quality; separate from top-level image quality.'),
  profile: z.string().min(1).max(4096).refine(value => {
    const tokens = value.trim().split(/[\s,，]+/).filter(Boolean)
    return tokens.length > 0 && tokens.every(token => /^[a-zA-Z0-9]+$/.test(token))
  }, 'Use alphanumeric profile codes separated by spaces or commas.').optional(),
}).strict()

export type MidjourneyOptions = z.infer<typeof midjourneyOptionsSchema>
