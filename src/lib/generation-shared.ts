/**
 * Shared utilities between generate_image and generate_video tools.
 * Both hit the same backend endpoint (/api/generate/v2) and share the
 * same rate limit (12/min/user), so they must share the API semaphore.
 */

import { Semaphore } from './semaphore.js'

// Shared API semaphore — image + video both submit to /api/generate/v2 and share
// the backend rate limit (12 req/min/user). Splitting into two Semaphore(4) instances
// would let MCP burst to 8 concurrent submits and trip 429.
export const sharedApiSemaphore = new Semaphore(4)

/** Translate a raw provider/network error message into actionable user guidance. */
export function classifyError(message: string): string {
  const lower = message.toLowerCase()

  if (lower.includes('safety') || lower.includes('policy') || lower.includes('flagged') || lower.includes('content_blocked') || lower.includes('moderation'))
    return 'The prompt may have triggered a content safety filter. Try rephrasing the prompt to avoid sensitive content.'

  if (lower.includes('credit') || lower.includes('insufficient') || message.includes('402'))
    return 'Insufficient credits. Daily free credits refresh each day, or view plans and top up at https://www.meigen.ai/model-comparison.'

  if (lower.includes('timed out') || lower.includes('timeout'))
    return 'Generation timed out. This can happen during high demand. You can try again — it may succeed on retry.'

  if (lower.includes('rate') && (lower.includes('limit') || message.includes('429')))
    return 'Too many requests. Wait a moment and try again.'

  if (lower.includes('model') && (lower.includes('invalid') || lower.includes('inactive')))
    return 'This model may be unavailable. Use list_models to check currently available models.'

  if (lower.includes('ratio') && lower.includes('not supported'))
    return 'This aspect ratio is not supported by the selected model. Use list_models to check supported ratios, or omit aspectRatio to let the server auto-infer.'

  if (lower.includes('token') && (lower.includes('invalid') || lower.includes('expired')))
    return 'API token issue. On Claude Code, run /meigen:setup to reconfigure. On other hosts, check your MEIGEN_API_TOKEN env var or the env block for the meigen server in your MCP config.'

  if (lower.includes('econnrefused') || lower.includes('fetch failed') || lower.includes('network'))
    return 'Network connection issue. Check your internet connection and try again.'

  if (lower.includes('comfyui') || lower.includes('node_errors'))
    return 'ComfyUI workflow error. Use comfyui_workflow view to inspect the workflow, or try a different one.'

  return 'You can try again, or use a different prompt/model.'
}
