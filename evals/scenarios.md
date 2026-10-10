# Eval scenarios

Manual host-level checks complement `pnpm test`; run with the locally built 3.0.0 package and a controlled backend before public release. Use current tool schemas, server instructions and [the workflow contract](../COMPOSABLE_WORKFLOWS.md). Real paid-provider checks require an explicitly approved scope and budget.

| ID | Input or condition | Expected behavior | Failure to catch |
| --- | --- | --- | --- |
| G1 | Generate one portrait with a supplied short prompt | Preserve the prompt and requested count; use defaults for omitted settings and generate once | Forced prompt enhancement, another confirmation for already approved scope, extra variants |
| G2 | Generate using a detailed supplied prompt/model/provider | Preserve all supplied settings | Rewriting the prompt or overriding the selected provider |
| G3 | Use a real local product photo | Local MCP reads, prepares and uploads the file automatically | Fabricated paths/base64; asking for manual upload when local file access exists |
| G4 | Add text to this existing image | Pass the reference and requested edit | Re-describing or replacing the existing image |
| G5 | Generate four already approved concepts | Generate exactly four within the caller's budget and concurrency limit | Forcing the user to choose only one; adding images; omitting requested outputs |
| G6 | Existing workflow calls with requestId, wait=false, download=false | Return structured task handle; no local download or forced preview | Waiting for completion, inventing output URL, requiring a creative assistant |
| V1 | Generate one video with resolved model/settings/budget | Submit once; use live model discovery only when needed | Blanket video reconfirmation or switching to image generation |
| V2 | Animate a supplied first-frame photo | Use firstFrame and a motion prompt | Losing the frame or replacing the prompt with a scene description |
| V3 | lastFrame without firstFrame | Explain the missing firstFrame and stop before submission | Silent retry or treating the last frame as the first |
| V4 | Completed result has a different media type than the requested tool, including terminal dedupe/recovery | Keep success, actual mediaType/URLs and original requestedMediaType; return review_media_type | Silently advancing, discarding paid output, saving an image as MP4 or automatically resubmitting |
| V5 | Transient status-query failures after accepted submission | Retry only observation; stop after three consecutive errors, reset on valid status, honor Retry-After and total deadline | Reporting the paid generation itself as failed, ignoring cancellation/budget, or submitting a replacement |
| V6 | Observation deadline expires | Keep requestId/generationId, processing/unknown state and recovery action | Claiming cancellation, refund or generation failure without evidence |
| R1 | Same ordinary request retried while submission lease is active | HTTP 503 + retry timing; npm 1.4.0 and 2.0.0 retain the original ID | HTTP 409 for an in-progress lease causing 1.4.0 to allocate a new ID |
| R2 | Process restart or missing local receipt | Query the authenticated backend by explicit requestId before reference upload | Uploading another reference URL and conflicting with the accepted input |
| R3 | Private receipt directory unavailable | Emit receiptWarning and preserve the request ID; use process memory safely | Relaxing permissions, following unsafe symlinks, or blocking every generation |
| R4 | Cancel a Skill before upload or paid submission | No upload/POST starts; give concise cancellation feedback | Sending a paid request after the cancellation signal |
| R5 | Cancel after a Skill POST may have been sent | Retain original Skill/request ID and recovery action | Claiming the job was cancelled server-side or retrying under a new ID |
| R6 | Download fails after successful generation | Return successful media URL with downloadWarning; clean partial files | Losing the result or changing successful generation to failed |
| R7 | Changed inputs with a reused request ID | Stop on conflict and inspect original attempt | Automatically replacing the ID to evade the conflict |
| R8 | Accepted generation deleted | Report generation_unavailable with existing identity | Creating a replacement or assuming refund |
| R9 | Recovery endpoint returns HTML or unknown JSON 404 | Return endpoint_unavailable / check_backend; preserve original IDs and make no paid POST | Treating a missing route as request_not_found or requiring all installed npm copies to be withdrawn |
| R10 | Recovery endpoint returns JSON request_not_found with HTTP 404 | Verify saved inputs/account; recover an interrupted submission with the same UUID | Minting a replacement UUID or treating any HTTP 404 as equivalent |
| P1 | No generation provider configured; search inspiration | Public discovery works | Requiring a key for public search |
| P2 | MeiGen key invalid or missing | Point to the API-key setup page; keep secrets in private host configuration | Asking to paste credentials into chat or making repeated requests |
| P3 | MeiGen credit balance insufficient | Explain purchased-only API billing and link to the owning account's profile | Claiming daily/free credits apply; replacing the request ID automatically |
| P4 | OpenAI-compatible provider returns 402 | Direct to that provider's billing configuration | Linking MeiGen top-up or claiming a MeiGen recovery receipt exists |
| S1 | Product-detail request for a specific number of modules | Pass explicit modules and requested count; resolve only missing essential material | Falling back to a hidden three-image MCP default |
| S2 | Upscale supplied photo | Use original source, accepted live quote and dedicated upscale flow | Generic resizing before consent; missing confirmedCredits |
| S3 | Host can read attachment bytes | Use upload_skill_image or authenticated /api/skills/upload; remove private metadata | Raw public presign instruction or fabricated attachment access |
| S4 | Host cannot read attachment | Explain briefly and request a direct image URL or local-MCP file access | Inventing a URL or asking the user to type base64 |
| S5 | Social thumbnail workflow receives an unresolved campaign poster with supplied copy | Prefer generate_marketing_poster and lay out supplied headline content; reserve blank space only for caller-requested image-only overlays; explicit upstream tool choices still win | Forcing generic image generation or leaving the poster headline blank against intent |
| S6 | Poster supplies preset, written style and style reference | customStyle overrides styleId; styleImage is the primary visual reference and text a compatible supplement | Treating labels as IDs or copying reference products/text/layout |
| S7 | First-time host reads Skill schema and examples | Explain extraNotes and distinct image roles; parse and execute published MCP examples against a mock endpoint | Bare ambiguous fields, unused conflicting descriptions or invalid tool-call arguments |
| S8 | User asks for size, completion time and cost | Read live specifications/prices; distinguish quality, output resolution, reference limits and observation timing | Inventing fixed ETA, hardcoded credit cost or an unsupported resolution argument |
| S9 | Poster request mixes exact copy with “use a vintage style” | Keep visible wording in content with autoCopy=false; put design directions in extraNotes/customStyle and do not print them verbatim; retain explicitly requested extra display copy | Printing design instructions as a headline or dropping legitimate extra display text |
| U1 | Successful result | Return actual structured handles and URLs; caller controls presentation | Inventing image contents or forcing intermediate previews |
| U2 | Price inquiry | Use current catalog/model prices | Repeating model or credit numbers from old text |
| U3 | Chinese user request | Chinese guidance; technical argument names unchanged | Translating field names or switching language without reason |

To add a regression case, give a concrete trigger, the expected observable result and the incorrect action to catch. Keep this checklist aligned with the current atomic-tool contract; optional creative guidance is not a mandatory prerequisite.
