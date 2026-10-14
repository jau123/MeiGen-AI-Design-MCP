/**
 * generate_video Tool — MeiGen-only, requires authentication
 * Wraps the same /api/generate/v2 endpoint with video-specific parameters.
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { MeiGenConfig } from '../config.js'
import type { MeiGenApiClient } from '../lib/meigen-api.js'
import { generationControls, generationOutputSchema, generationResult, errorOutput, GenerationError } from '../lib/generation-contract.js'
import { runMeiGenGeneration } from '../lib/generation-operation.js'
import { mergeReferenceVideos } from '../lib/generation-references.js'

export const generateVideoSchema = {
  ...generationControls,
  prompt: z.string().trim().min(1, 'Prompt cannot be empty').describe('The video generation prompt. Describe motion, scene, and style — not just the still image.'),
  modelId: z.string().trim().min(1).optional().describe('Alias of model. Provide at least one; both must match when supplied.'),
  model: z.string().trim().min(1).optional().describe('Video model ID. REQUIRED; call list_models for the live lineup and capabilities.'),
  tier: z.string().optional()
    .describe('Optional model tier. Use list_models for the selected model\'s live tier values.'),
  duration: z.number().int().positive().optional()
    .describe('Video duration in seconds. Use list_models for the model\'s enum/range; when omitted the server uses the omitted-request default shown there.'),
  resolution: z.string().optional()
    .describe('Output resolution. Use list_models for the selected model/tier\'s live values.'),
  aspectRatio: z.string().optional()
    .describe('Aspect ratio: "16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "auto", "adaptive" (model-dependent). Defaults to "auto" when omitted.'),
  firstFrame: z.string().optional()
    .describe('First-frame image when required or supported by the selected model. Accepts a public URL or local file path (auto-uploaded); use list_models and let the server enforce the live model contract.'),
  lastFrame: z.string().optional()
    .describe('Optional last-frame image for a model that supports it. Accepts a public URL or local file path; requires firstFrame. Use list_models for the live model contract.'),
  contentReferenceImages: z.array(z.string()).max(30).optional().describe('For new calls always pass [] for endpoint frames or content image URLs/local paths for identity/style/scene references. Use list_models capabilities.videoInputs/byTier for limits and combinations. Endpoints must not mix with content/video/audio unless supported. Use capabilities.videoInputs.referenceMentionSyntax (or the selected byTier entry) when declared: HeyGen cannot combine reference video with separate reference audio (embedded video audio is allowed); read capabilities.video.referenceAudio.canCombineWithVideo. HeyGen uses [image1], [video1], [audio1], numbered within each supplied bank. Only models without declared syntax use Image N / Video N / Audio N.'),
  referenceVideo: z.string().optional()
    .describe(
      'Deprecated single-clip alias of referenceVideos. Still accepted forever; when referenceVideos is also supplied it must equal its first entry. Prefer referenceVideos.'
    ),
  referenceVideos: z.array(z.string()).max(10).optional()
    .describe(
      'Reference video clips for a model that advertises reference-video support in list_models. Each entry is either an https://images.meigen.ai/... URL — typically a clip MeiGen generated earlier, passed through unchanged — or a local .mp4/.mov path, which is uploaded for you (local paths require MEIGEN_API_TOKEN). Other hosts are rejected: the server only probes clips it can fetch from that CDN, so pass the local file instead. ' +
      'Per-model limits — maximum number of clips, per-clip seconds and the maximum SUM of clip seconds — come from list_models; the server enforces them and rejects an over-limit request before charging. ' +
      'IMPORTANT — prompt requirement: to make the new clip semantically continue a reference, the `prompt` MUST explicitly say "extend" / "continue" (e.g. "Extend this video with the following plot:"). Without that, the model treats the clips as visual reference only. ' +
      'Use capabilities.videoInputs.referenceMentionSyntax (or the selected byTier entry) when declared: HeyGen cannot combine reference video with separate reference audio (embedded video audio is allowed); read capabilities.video.referenceAudio.canCombineWithVideo. HeyGen uses [image1], [video1], [audio1], numbered within each supplied bank. Only models without declared syntax use Image N / Video N / Audio N. ' +
      'Output behavior: the output is only the configured `duration` of new content — reference clips are never concatenated into it. ' +
      'Follow capabilities.video.billing.referenceSeconds and its minimum table; add server-probed input-video seconds only when declared. Use upload_reference_media durationSeconds for an estimate; backend probing and billing remain authoritative.'
    ),
  referenceAudios: z.array(z.string()).max(10).optional()
    .describe(
      'Reference audio clips for a model whose list_models entry shows a "Reference audio" line. Each entry is either an https://images.meigen.ai/... URL or a local .wav/.mp3 path, which is uploaded for you (local paths require MEIGEN_API_TOKEN). Other hosts are rejected: pass the local file and the server uploads it. ' +
      'Per-model limits (clip count, per-clip seconds, total seconds, accepted formats and per-file size) come from list_models. On a model whose line says it requires a visual reference (Seedance 2.0), the request must also carry at least one reference image or reference video — audio alone is rejected. ' +
      'Use capabilities.videoInputs.referenceMentionSyntax (or byTier) when declared: HeyGen [audio1], [audio2]; do not combine with reference videos when capabilities.video.referenceAudio.canCombineWithVideo is false. Only models without declared syntax use Audio N. Reference audio seconds are never billed.'
    ),
  referenceVideoDuration: z.number().int().positive().optional()
    .describe('Deprecated compatibility hint. Ignored because the server probes the authoritative duration of every clip.'),
}

export function registerGenerateVideo(server: McpServer, apiClient: MeiGenApiClient, config: MeiGenConfig) {
  server.registerTool('generate_video', {
    description: 'Generate a MeiGen video using a required live model ID from list_models. Reference videos and reference audio are passed as referenceVideos / referenceAudios arrays (images.meigen.ai URLs, or local files which are uploaded for you — prepare other direct HTTPS URLs first with upload_reference_media); per-model counts and second budgets come from list_models, and audio seconds are never added to billing, though content-reference rates may apply. Preserve the caller’s resolved prompt, parameters and authorized scope. Set requestId, wait=false and download=false for workflow submission; then query check_generation. At most four submissions run concurrently per MCP process; the backend quota and Retry-After remain authoritative. Video generation consumes purchased credits.',
    inputSchema: generateVideoSchema, outputSchema: generationOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, async ({ prompt, model, modelId, tier, duration, resolution, aspectRatio, firstFrame, lastFrame, contentReferenceImages, referenceVideo, referenceVideos, referenceAudios, referenceVideoDuration, requestId, wait = true, download = true }, extra) => {
    if (!model && !modelId) return generationResult(errorOutput(new GenerationError('A video model or modelId from list_models is required.', 'model_required')))
    if (model && modelId && model !== modelId) return generationResult(errorOutput(new GenerationError('model and modelId must match when both are provided.', 'model_alias_conflict')))
    model = model ?? modelId
    if (lastFrame && !firstFrame) return generationResult(errorOutput(new GenerationError('lastFrame requires firstFrame.', 'invalid_reference'), { requestId, mediaType: 'video', provider: 'meigen' }))
    if (referenceVideoDuration !== undefined && !referenceVideo && !referenceVideos?.length) return generationResult(errorOutput(new GenerationError('referenceVideoDuration requires a reference video; the backend measures the actual duration of every clip.', 'invalid_reference'), { requestId, mediaType: 'video', provider: 'meigen' }))
    // Reject a contradictory legacy/array pair here, before any upload or paid submission.
    try { mergeReferenceVideos(referenceVideo, referenceVideos) }
    catch (error) { return generationResult(errorOutput(error, { requestId, mediaType: 'video', provider: 'meigen' })) }
    return generationResult(await runMeiGenGeneration('video', {
      prompt, modelId: model, tier, duration, resolution, aspectRatio,
      referenceImages: [firstFrame, lastFrame].filter((value): value is string => Boolean(value)),
      ...(contentReferenceImages !== undefined ? { contentReferenceImages } : {}),
      referenceVideo,
      // Never [] — an empty array would change this request's saved fingerprint.
      referenceVideos: referenceVideos?.length ? referenceVideos : undefined,
      referenceAudios: referenceAudios?.length ? referenceAudios : undefined,
      requestId, wait, download,
    }, apiClient, config, extra.signal, async message => {
      try { await extra.sendNotification({ method: 'notifications/message', params: { level: 'info', logger: 'generate_video', data: message } }) } catch { /* Hosts may not implement logging. */ }
    }))
  })
}
