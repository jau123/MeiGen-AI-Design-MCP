# Compose MeiGen inside a workflow

[中文](COMPOSABLE_WORKFLOWS.zh-CN.md) · [Connection setup](README.md#quick-start) · [Five Skills HTTP API](SKILLS_API.md)

Use MeiGen as a callable step inside an existing agent, Skill, script or application. The caller owns the creative plan, prompts, model/provider choices, output count, approved budget, scheduling and presentation. Optional MeiGen creative assistants can help develop a brief; they are not required before calling tools. Discovery can support any workflow. A resolved upstream plan does not need another approval for every frame, clip or batch.

Requires local **`meigen` 2.0.1 or later** (`npx -y meigen@3.1.0`; 2.0.0 lacks `referenceVideos` / `referenceAudios`), or the updated remote endpoint **`https://www.meigen.ai/api/mcp`**. npm 1.4.0 does not implement this contract. Reconnect and inspect the installed schemas for `requestId`, `wait` and request lookup. Backend rollbacks must preserve recovery endpoints and the durable POST contract; users do not need to withdraw already installed npm packages.

## Ordinary task contract

| Field or tool | Contract |
| --- | --- |
| `requestId` | Persist a UUID per logical image/video attempt before submitting. Reuse that ID and exact inputs for recovery; a genuinely new paid attempt gets a new ID. |
| `wait: false` | Submit and return a task handle without waiting for media completion. Required: `requestId` on local npm. Remote generation always needs `requestId` or the legacy `attemptId`. |
| `wait: true` | Existing default: wait for completion or return an actionable processing/error state. A tool timeout does not cancel an accepted job. |
| `download: false` | Local npm: skip saving generated media when only URLs are needed. Default is `true` for compatibility; `wait: false` skips download regardless. Remote MCP has no `download` parameter and returns URLs. |
| `check_generation` | Supply the original `requestId` or returned `generationId`, not both. Pass the returned `nextAction.arguments` unchanged when checking again; it preserves the optional original `requestedMediaType` (`image` or `video`). For manual recovery, include that intent from the saved plan when known. Request lookup can recover a MeiGen attempt across host/process restarts; it is not limited to a local cache. |
| `firstFrame` | Pass a completed frame URL to a video model that supports it. The caller chooses whether to inspect or show the frame first. |

The recoverable cloud-task contract above is for MeiGen. Optional local OpenAI-compatible providers may expose different asynchronous support; inspect their tool schema and returned errors rather than assuming a MeiGen receipt exists for those jobs. Preserve explicitly supplied model/provider and generation settings. `list_models` is available whenever a workflow needs current capabilities or prices; video requires a model.

Read `structuredContent`, not a human-readable sentence or a local filename, to advance a workflow. Ordinary results share these fields when available:

- `success`, `status`: `processing`, `completed`, `failed`, `error` or `unknown`.
- `requestId`, `generationId`, actual `mediaType`, optional original `requestedMediaType`, `modelId`, `deduped`.
- `urls` (always an array), plus `imageUrl` or `videoUrl` when returned.
- `creditsUsed`, `creditsStatus`; a refund is confirmed only by the returned ledger state.
- `pollAfterSeconds`, `observationEnded`; `nextAction` can carry `type`, `tool`, `arguments`, `afterSeconds`, `message`.
- `error`: `code`, `message`, `retryable`, and optional `httpStatus`, `retryAfterSeconds`, `required`, `available`.
- Local npm may also return `provider`, `savedPath`, `downloadWarning` (generation succeeded but local saving failed) and `receiptWarning` (private durable storage unavailable; keep request IDs and exact inputs in the caller).

A submitted job is not a completed artifact. `unknown` is an observation/recovery state, not permission to generate a replacement. Ordinary tasks use `check_generation`; the five dedicated Skills use their own `check_skill`, original Skill/request ID and exact `retryParameters`. Skill receipts require the original API key; ordinary request lookup supports another active API key of the same owning account. Do not transfer Web-session free-credit jobs into API-token billing.

## Minimal call

With an authenticated connected MCP `client`, this complete step has no external plan variables. Persist `input` before calling; the UUID below is for this one example only. Use a new UUID for a different intended image, and reuse the saved one when resuming.

```js
const input = {
  requestId: '6aa98390-dc79-49f2-8996-20c915968bd8',
  prompt: 'A ceramic teapot on a pale wooden table, soft window light',
  wait: false,
};
const submitted = await client.callTool({ name: 'generate_image', arguments: input });
const result = submitted.structuredContent;
if (result.nextAction?.type === 'check_generation') {
  const checked = await client.callTool({
    name: 'check_generation', arguments: result.nextAction.arguments,
  });
  // Persist checked.structuredContent; follow nextAction before advancing.
}
```

## Example: N scripts → N frames → N videos

The upstream workflow first resolves the scripts, image/video settings, requested output count, maximum approved budget and any replacement policy. It can use `list_models` for current choices. No fixed model, price, duration or quality is assumed here.

1. Create and durably save one frame UUID and one video UUID per script, alongside the exact inputs. Do this once when creating the workflow, not on every run or retry.
2. Before a new submission, reserve its expected charge against the remaining approved budget, including all other in-flight reservations. Use the selected live model/tier/duration/reference pricing; reconcile actual `creditsUsed` and confirmed refunds as results arrive. An unknown charge stays reserved until resolved.
3. Submit independent frame steps with bounded concurrency. Persist each response immediately. After a frame completes, preserve its selected URL in that script's video input before submitting the video step. This maintains a stable dependency even if the frame model returns multiple candidates.
4. Poll/recover accepted steps by their existing handles. A host restart reloads the saved plan and checks pending steps; it does not recreate UUIDs or re-upload unchanged references.
5. Return completed clips and any failed/unresolved steps to the caller. The caller decides intermediate previews, visual inspection, downloads, final presentation and whether an authorized replacement is appropriate.

The following JavaScript shows MCP calls from an existing caller. `script`, settings and persisted IDs come from that caller's durable plan; `client` is its connected MCP client. These are call examples, not a scheduler or a new API SDK.

```js
// Load this step from the saved plan. Do not allocate a fresh ID on resume.
const frame = await client.callTool({
  name: 'generate_image',
  arguments: {
    ...plan.frameSettings,
    prompt: script.framePrompt,
    requestId: script.frameRequestId,
    wait: false,
    download: false, // Local npm only; omit this field for remote MCP.
  },
});
// Persist frame.structuredContent before advancing the workflow.

const frameStatus = await client.callTool({
  name: 'check_generation',
  arguments: { requestId: script.frameRequestId, requestedMediaType: 'image' },
});
// While processing, wait for the returned polling hint and check again.
// Advance only on completed status with the expected media type and an actual URL.
// Follow check_backend/review_media_type actions before advancing; do not automatically resubmit.
```

```js
// Content-reference mode: do not also set firstFrame/lastFrame.
// plan.videoInputs is the selected live model/tier capability. Use declared mention syntax.
// Estimate costs from its billing capability; not every model bills input-video seconds.
const videoLabel = plan.videoInputs.referenceMentionSyntax?.video.replace('N', '1') ?? 'Video 1';
const audioLabel = plan.videoInputs.referenceMentionSyntax?.audio.replace('N', '1') ?? 'Audio 1';
const video = await client.callTool({
  name: 'generate_video',
  arguments: {
    ...plan.videoSettings, // Includes the caller-selected live model.
    prompt: `Extend this footage: ${script.videoPrompt} Keep the camera move of ${videoLabel} and the rhythm of ${audioLabel}.`,
    contentReferenceImages: [script.selectedFrameUrl],
    referenceVideos: [script.referenceClipUrl, '/Users/me/clips/pan.mp4'], // images.meigen.ai URLs pass through; local file paths work on the local npm server only (remote MCP takes images.meigen.ai URLs).
    referenceAudios: ['/Users/me/audio/theme.mp3'],
    requestId: script.videoRequestId,
    wait: false,
    download: false, // Local npm only; omit for remote MCP.
  },
});
// Persist video.structuredContent; recover with the same videoRequestId.
```

Local npm has **four shared API submission slots**. Polling and downloading do not occupy these slots; this does not cap the number of accepted jobs still running remotely. The caller should bound both submissions and outstanding paid work. Respect actual backend rate limits and `Retry-After`; there is no universal ten-image workflow cap or blanket ban on parallel video jobs.

The budget is a caller-managed limit, not an atomic server-enforced batch cap. Estimates can change; stop for a newly required price/resize decision outside existing authorization. Independent steps can partially succeed, and a failure does not roll back completed frames or clips.

Local `wait: true` retries transient status-query errors within bounds: stop after three consecutive errors and reset the count on a valid status. Honor a larger `Retry-After`; queries and backoff share the total observation budget. Cancellation and terminal errors stop immediately. This retries queries only, never generation POSTs, and does not prove cancellation, failure or refund.

## Resume without creating duplicate jobs

| Situation | Action |
| --- | --- |
| `processing` | Keep the handle; follow `pollAfterSeconds`/`nextAction`. Do not submit another job. |
| Transport timeout, 5xx or uncertain submit result | Query `check_generation` with the persisted `requestId`. Keep exact inputs and source URLs. If recovery calls for resubmission, reuse that same ID. |
| JSON request_not_found + HTTP 404 | Verify account, ID and saved inputs. An interrupted first submission can be retried with the same ID; do not allocate a replacement ID. |
| endpoint_unavailable / check_backend | HTML or unknown JSON 404 does not establish that a request was never submitted. Keep IDs/inputs, verify the API URL and restore the compatible backend. Do not automatically resubmit. Known generationId status can still use the existing status endpoint. |
| review_media_type | The result is complete: preserve success, actual media and URLs. Compare requestedMediaType and review the model before advancing; do not automatically generate a replacement. |
| Ordinary-generation 402 before dispatch | Top up the owning account, then resubmit the same ID and identical inputs within authorized scope. Polling does not restart it. Skill payment rejection follows the separate Skill rules. |
| 429 or an in-progress reservation | Honor returned retry timing/`Retry-After`; preserve the attempt and keep its budget reservation. |
| `idempotency_conflict` / `request_id_collision` | Stop and inspect the original attempt. Do not bypass the conflict with an automatic new ID. New intended inputs require a separately authorized attempt. |
| `failed` | Preserve successful sibling steps and reported refund state. A replacement is a new paid attempt and must be within the caller's explicit replacement scope. |
| Deleted original job / HTTP 410 | Preserve the attempt ID and report the unavailable original. Never reuse that ID to create a replacement. |
| `observationEnded` | Stop aggressive polling and report the unresolved state to the caller. The job is not proven failed or cancelled. |

For ordinary tasks, remote `attemptId` remains a legacy compatibility handle. Prefer UUID `requestId` in new integrations. Older receipts may lack the normalized input data needed to verify all past parameter mismatches; do not assume the new protection can retroactively validate every old task.

**Legacy key rotation:** when an old `attemptId` submission lost its response, recover it using the original key before revoking that key. The old handle incorporates the key; a new key cannot reconstruct an unrecorded old identity. Keep a returned `generationId` when available, and do not automatically resubmit an unresolved legacy attempt with a new key.
