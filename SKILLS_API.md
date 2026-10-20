# MeiGen Skills HTTP API

These endpoints power both remote MCP and the local **meigen** package. Backend deployment makes the HTTP features available; publishing npm alone does not enable them. See the [English](README.md#skills) / [中文](README.zh-CN.md#skills) tutorials for AI-client setup and examples in natural language.

## Compose without taking over the caller

The caller owns the creative plan, explicit inputs, output count, approved budget and presentation. Use a dedicated Skill directly when it fits a step; prompt enhancement, preference loading, creative alternatives and plugin agents are optional. Do not repeat an approval already established by an upstream request. Ask only for missing required inputs or an additional cost/resize/replacement decision outside existing authorization.

Persist each step's UUID and exact input before submission. Reserve estimated in-flight costs and reconcile returned charges/refunds; multiple jobs are not an atomic batch and this API does not enforce an overall workflow budget. Keep partial results. Return handles/status/URLs to the caller, which decides previews and downloads. Inspect actual media before describing it.

Ordinary frame/video jobs have a separate `requestId` / `wait` / `check_generation` contract; these fields do not add `wait` or `download` parameters to Skill endpoints. See [composable workflow examples](COMPOSABLE_WORKFLOWS.md).

The shell examples require Node.js, jq, and curl 7.76 or later (`--fail-with-body`).

## Authentication and billing

Base URL: `https://www.meigen.ai`.

New MCP users should connect `https://www.meigen.ai/api/mcp` with OAuth account sign-in. The direct HTTP and local npm examples below are for existing legacy integrations only: keep the existing `MEIGEN_API_TOKEN` privately in the application environment; their upload, run and status calls use `Authorization: Bearer <key>`. Keep credentials out of chat, URLs, source control and logs.

All five Skills use **purchased credits only**, including the first cutout. Web daily free credits and free attempts do not apply. Buy credits on the same account through [Profile → Top Up](https://www.meigen.ai/profile), or [mobile Premium](https://www.meigen.ai/m/premium). OpenAI-compatible keys cannot run these workflows.

Prices come from the public catalog below. Product Detail Images charge per dispatched module, not once per batch. Failed generation charges follow the existing billing ledger; report a refund only when its returned `creditsStatus` confirms it.

## Endpoints

| Method and path | Required material | MCP tool |
|---|---|---|
| `GET /api/skills?skill=upscale` (filter optional) | None; public catalog | `list_skills` |
| `POST /api/skills/upload` | Exactly one `sourceUrl` or `imageBase64` | `upload_skill_image` |
| `POST /api/skills/remove-bg/run` | `productImage` | `remove_background` |
| `POST /api/skills/product-detail/run` | `productImage`, resolved output count | `generate_product_detail_images` |
| `POST /api/skills/brand-poster/run` | `brand`: brand, event, campaign or topic | `generate_marketing_poster` |
| `POST /api/skills/white-bg/run` | `productImage`; `customPrompt` in custom mode | `generate_ai_background` |
| `POST /api/skills/upscale/run` | `imageUrl`: original still image | `upscale_image` |
| `GET /api/skills/status?skill=…&requestId=…` | Original Skill and request UUID, same key | `check_skill` |

Only these five Skills are exposed to API keys. Video upscale and AI Expand are outside this API. Ordinary image/video status uses separate `check_generation` (public by known generation ID; authenticated by request ID); Skill recovery requires the owning API key.

The catalog returns each Skill's `inputSchema`, defaults, required materials, options and pricing. Read it before building a form or quoting a cost. Successful catalog responses may be cached for up to five minutes; run-time validation uses the backend configuration. Cross-field rules remain enforced by the run endpoint. Run schemas reject unknown fields, including caller-supplied internal billing and batch fields.

```bash
curl --fail-with-body --silent --show-error https://www.meigen.ai/api/skills
```

## Prepare an image

Standard reference fields (`productImage`, `logo`, `modelImage`, `styleImage`, `productImages`, `extraProductImages`) accept HTTPS URLs on `images.meigen.ai`, `images.meigen.art` and `pbs.twimg.com`. Prepare other public sources through `/api/skills/upload`, then use its returned `imageUrl`.

| Input | Standard reference | Upscale original |
|---|---|---|
| `sourceUrl` | Public direct HTTPS image, ≤8 MiB | ≤64 MiB; set `purpose: "upscale"`, or pass original URL straight to `/upscale/run` |
| `imageBase64` | Actual raw base64, ≤3 MiB decoded | Same limit; set `purpose: "upscale"` |
| Formats | JPEG, PNG, WebP, GIF (first frame) | Still JPEG, PNG, WebP only |
| Decoded pixels | ≤64 million | ≤64 million |
| Prepared output | Longest edge ≤4096px, ≤8 MiB | Original dimensions; resize confirmation happens at run time |

Both preparation paths fully decode, correct orientation and remove EXIF/XMP/ICC metadata. Alpha is preserved; generation-provider output is separate from this input guarantee. The backend only downloads public IPv4 sources over HTTPS with normal TLS validation. Credentials, nonstandard ports, fragments, private-network sources, redirects, login pages and IPv6-only sources are unsupported. Source 429/5xx responses are temporary failures, so retry after waiting.

For the examples below, set `SOURCE_URL` to your real public direct image URL locally. `jq` builds JSON safely; the token must already exist in the environment.

```bash
jq -n --arg sourceUrl "$SOURCE_URL" '{sourceUrl:$sourceUrl,purpose:"reference"}' |
  curl --fail-with-body --silent --show-error https://www.meigen.ai/api/skills/upload \
    -H "Authorization: Bearer $MEIGEN_API_TOKEN" -H 'Content-Type: application/json' \
    --data-binary @- > skill-upload.json
IMAGE_URL=$(jq -er '.imageUrl' skill-upload.json)
export IMAGE_URL
```

For readable attachments, send `{ "imageBase64": "<raw bytes encoded as base64>", "purpose": "reference" }` instead; omit the `data:` prefix and do not send both inputs. Applications should read and encode the actual file themselves, never ask a user to type base64. Uploading does not submit a generation or spend generation credits.

Local npm MCP also accepts absolute local paths (Windows drive/UNC, POSIX, `~/`, `file://`). Standard local source files may be ≤32 MiB; they become ≤4096px / 8 MiB references. Upscale local sources may be ≤64 MiB and retain dimensions; encoding must fit 9,500,000 bytes for the existing upload gateway. If that cannot be achieved without resizing, use a public original URL. Local presign and PUT timeouts are 15 and 30 seconds. Custom CDN uploads are automatically prepared through the authenticated API for standard Skills; Upscale sends the original public URL directly to the backend.

Keep original files and download results you want to retain. Public image URLs are accessible to anyone with the link and are not a permanent-storage guarantee.

## Submit a Skill

Every new paid attempt needs a client-generated UUID `requestId`. Save it and the exact submitted input before sending. These examples create a new UUID with Node; choose the endpoint you intend to run. Re-running a block creates a **new paid attempt**, so use the recovery flow after interruptions.

### Remove Background

One `productImage`; returns one transparent cutout. No prompt, free attempt or batch option.

```bash
REQUEST_ID=$(node -e 'process.stdout.write(crypto.randomUUID())')
jq -n --arg requestId "$REQUEST_ID" --arg productImage "$IMAGE_URL" '{requestId:$requestId,productImage:$productImage}' |
  curl --fail-with-body --silent --show-error https://www.meigen.ai/api/skills/remove-bg/run \
    -H "Authorization: Bearer $MEIGEN_API_TOKEN" -H 'Content-Type: application/json' --data-binary @-
```

### Product Detail Images

Produces 1–6 images, one per module. Presets: `hero`, `detail`, `scene`, `material`, `usage`, `brand`; duplicates are rejected. Custom modules use `{name, description}` with nonempty trimmed text (max 40/500 characters). Presets plus custom modules must total 1–6.

**Direct HTTP defaults to three paid images** (`hero`, `detail`, `scene`) when `modules` is omitted. MCP requires explicit `modules`. Pass `modules: []` for custom-only output. Resolve the count from the user's request and quote the batch price without adding unwanted images.

```bash
REQUEST_ID=$(node -e 'process.stdout.write(crypto.randomUUID())')
jq -n --arg requestId "$REQUEST_ID" --arg productImage "$IMAGE_URL" \
  '{requestId:$requestId,productImage:$productImage,modules:["hero","detail"],platform:"amazon",language:"en",quality:"low",aspectRatio:"4:5"}' |
  curl --fail-with-body --silent --show-error https://www.meigen.ai/api/skills/product-detail/run \
    -H "Authorization: Bearer $MEIGEN_API_TOKEN" -H 'Content-Type: application/json' --data-binary @-
```

Optional inputs: `productName` (≤200), `sellingPoints` (≤2000), `extraRequirements` (≤500), `autoCopy`, `platform`, `language`, `uiLocale`, `quality`, `aspectRatio`, `modelImage`, `logo`, `extraProductImages` (≤2). `quality: low` means Fast/default, `medium` means Pro. `autoCopy` defaults to true; false uses supplied wording faithfully, subject to selected-language translation. Do not invent product facts. `aspectRatio: auto` resolves one ratio for the entire set and returns the concrete ratio. See the catalog for current language, platform and ratio enums.

### Marketing Poster

`brand` is the required subject, not necessarily a registered brand. Images are optional. `content` supplies a brief with `autoCopy: true`, or the exact visible wording with `autoCopy: false`, subject to selected-language translation. Put style/layout/design directions in `extraNotes` or `customStyle`, not in verbatim `content`. Omit dates, discounts and offers that the user did not provide.

```bash
REQUEST_ID=$(node -e 'process.stdout.write(crypto.randomUUID())')
jq -n --arg requestId "$REQUEST_ID" \
  '{requestId:$requestId,brand:"Coffee tasting",content:"Coffee tasting",autoCopy:false,language:"en",ratio:"4:5",quality:"low"}' |
  curl --fail-with-body --silent --show-error https://www.meigen.ai/api/skills/brand-poster/run \
    -H "Authorization: Bearer $MEIGEN_API_TOKEN" -H 'Content-Type: application/json' --data-binary @-
```

Optional inputs: `content`, `autoCopy` (true/default), `extraNotes`, `ratio` (`4:5`/default; `auto` resolves once for the poster), `language`, `uiLocale`, `quality` (`low`/`medium`), `logo`, `productImages` (≤3), `styleImage`, `styleId`, `customStyle`. Length limits and style/ratio enums are in the catalog. Poster `stylePresets` pairs each accepted `id` with a human-readable `label`; `styleSelection` documents Auto and precedence. Use the `id` in calls. The catalog `output` metadata describes current generation specifications, separate from input-upload limits.

#### Poster fields and reference roles

| Field | Meaning |
|---|---|
| `content` | Brief with `autoCopy: true`; exact visible wording with `autoCopy: false`, subject to selected-language translation. Keep style/layout/design directions out of verbatim content. |
| `extraNotes` | Additional verified facts, explicitly requested display copy, or layout/design requirements (≤500 characters). Design instructions are directions, not text to print verbatim; this field can still contain explicitly requested extra display copy. |
| `styleId` | Preset ID from `list_skills`, not the display label. Omit it and `customStyle` for Auto. |
| `customStyle` | Written visual direction (≤200 characters). Nonempty text overrides `styleId`; do not silently replace an explicit choice. |
| `styleImage` | Primary visual style: palette, lighting, typography and mood. Written style is a compatible supplement. Do not copy reference content, products, text or layout. |
| `logo` | Exact brand identity to reproduce accurately, not a style reference. |
| `productImages` | Up to three actual product/subject images; retain their identity, colors and branding. |

For Product Detail, `productImage` is the main product reference; `extraProductImages` supplies up to two additional angles/details of the same product. `modelImage` is a person reference used by hero/scene modules, not a model ID. The logo is a separate exact identity reference. For Remove Background the source can be a product, person or logo; AI Backgrounds needs the product whose surroundings should change. Only Upscale uses its dedicated original-image path.

### MCP tool-call example

Call `list_skills` with `{"skill":"brand-poster"}` first when current inputs, styles, output specifications or prices are needed. The following is a complete MCP `tools/call` parameter object for an illustrative user brief that already supplies the event and time; it needs no image. Its `content` is the exact visible wording; `extraNotes` gives layout and preservation instructions, not extra text to print. Send it through the connected MCP client (`client.callTool(...)`), not as the HTTP run body. It starts one paid poster. Generate and save a new UUID for a new intended attempt; reuse this attempt's original UUID and inputs only for recovery. Do not invent dates, prices or claims for a real user.

```json
{
  "name": "generate_marketing_poster",
  "arguments": {
    "requestId": "8f729f7e-934e-4e2c-bae3-bf23a782f964",
    "brand": "Coffee tasting",
    "content": "Coffee tasting\nSaturday, 10:00–12:00",
    "autoCopy": false,
    "extraNotes": "Keep the supplied time. Use a clear headline and a small schedule block.",
    "styleId": "minimalist",
    "language": "en",
    "ratio": "4:5",
    "quality": "low"
  }
}
```

Keep the returned handles and follow `nextAction`; submission does not prove completion. Interrupted poster calls use `check_skill` with `skill: "brand-poster"` and the original `requestId`. Generic `generate_image` prompts are not interchangeable with these structured Skill arguments.

### Output resolution and completion time

Current Product Detail and Marketing Poster workflows use the 2K output preset for both Fast (`low`) and Pro (`medium`); quality changes rendering effort, not that resolution preset. Exact pixel dimensions depend on ratio and provider output. AI Backgrounds smart/custom uses fast=1K and hd=2K; white mode has a fixed specification. Read the current `list_skills` output metadata when available rather than adding a `resolution` field that these tools do not accept. Upload-size limits describe inputs, not output dimensions.

No fixed completion time is guaranteed. Queueing, planning, provider execution and image count affect latency. Use returned estimates when available and follow status/`nextAction`; a polling interval or HTTP timeout is not an ETA. Use live catalog prices and the authorized image count instead of quoting hardcoded credit costs.

### AI Backgrounds

Requires one product image. `mode` is `white`, `smart` (default) or `custom`; custom requires a nonempty `customPrompt` up to 300 characters. `ratio: auto` matches source proportions. `quality: fast` (default) or `hd` applies only to smart/custom. White mode uses a fixed specification and ignores ratio/quality. Use Remove Background for a transparent cutout.

```bash
REQUEST_ID=$(node -e 'process.stdout.write(crypto.randomUUID())')
jq -n --arg requestId "$REQUEST_ID" --arg productImage "$IMAGE_URL" \
  '{requestId:$requestId,productImage:$productImage,mode:"custom",customPrompt:"A sunlit stone counter",ratio:"auto",quality:"fast"}' |
  curl --fail-with-body --silent --show-error https://www.meigen.ai/api/skills/white-bg/run \
    -H "Authorization: Bearer $MEIGEN_API_TOKEN" -H 'Content-Type: application/json' --data-binary @-
```

Image preparation through `/api/skills/upload`, and new API Upscale preprocessing, require a positive purchased-credit balance. Uploading does not deduct credits. A 402 means top up the same account, then retry; completed-job recovery remains available with zero balance.

### Upscale

Use `imageUrl` for the **original**. It may be any safe public direct HTTPS still JPEG/PNG/WebP image URL; this endpoint does not require the standard three-host allowlist. Do not pass a generically resized reference. `mode` is `crisp` (default, preserve structure) or `creative` (reconstruct details; explain possible changes). Images only; do not send `media: "video"`.

```bash
REQUEST_ID=$(node -e 'process.stdout.write(crypto.randomUUID())')
jq -n --arg requestId "$REQUEST_ID" --arg imageUrl "$SOURCE_URL" \
  '{requestId:$requestId,imageUrl:$imageUrl,mode:"crisp",allowDownscale:false}' |
  curl --fail-with-body --silent --show-error https://www.meigen.ai/api/skills/upscale/run \
    -H "Authorization: Bearer $MEIGEN_API_TOKEN" -H 'Content-Type: application/json' --data-binary @-
```

If either edge exceeds 4096px or total pixels exceed 16 million, the endpoint returns **409 `upscale_resize_required` before generation or charging**, including source dimensions. Explain that resizing may yield a result smaller than the original with limited clarity gain. After acceptance only, submit the same source/mode with `allowDownscale: true` and a **new** `requestId`. The backend prepares a provider-compatible image, preserving alpha.

`confirmedCredits` is required by both MCP transports, including the first call: supply the live `list_skills` quote within the accepted user or upstream workflow budget. It remains optional for direct HTTP callers. The field is a nonnegative integer for a pre-dispatch price check. When the current quote is higher, **409 `price_changed`** returns `quotedCredits` and `confirmedCredits` without starting a generation. Obtain acceptance before a new request ID with the accepted amount. This check runs after source preparation; it is not a transaction-level price lock. The billing RPC uses its live price. Clients needing a strict atomic spending ceiling must not treat this field as one.

A known accepted job that no longer exists returns **410 `generation_unavailable`** with its original ID. Stop polling and do not automatically create a replacement; missing records do not prove a refund. Partial batches keep available results and identify missing records separately.

## Recover, poll and display

Set `SKILL` to the endpoint identifier (`remove-bg`, `product-detail`, `brand-poster`, `white-bg` or `upscale`) and retain the last request's ID.

```bash
curl --fail-with-body --silent --show-error --get https://www.meigen.ai/api/skills/status \
  -H "Authorization: Bearer $MEIGEN_API_TOKEN" \
  --data-urlencode "skill=$SKILL" --data-urlencode "requestId=$REQUEST_ID"
```

A successful submission may return `generationId` or `items` before results exist. `submission` is a receipt, not proof of completion. Status is `processing`, `completed`, `partial` or `failed`; display completed `items[].imageUrls` by module and report failures/refund states individually. Do not replace a whole batch automatically when one module fails. Remove Background can return a completed `imageUrl` synchronously.

- For a saved completed receipt, the same key + Skill + `requestId` + normalized parameters replays the existing result without another dispatch. In-progress requests wait or recover under the lease rules below. Defaulted and explicitly default-valued parameters normalize equally.
- Changing inputs under an existing ID returns `409 idempotency_conflict`. Recover the original request first. A different API key cannot access its receipt, even on the same account.
- On a timeout/5xx, query status first. Preserve IDs, source URLs and parameters. When status supplies `retryable: true` and `retryParameters`, reuse those parameters exactly, including already-uploaded URLs. A local process restart is not permission to re-upload and create a new job.
- Processing polls normally wait ten seconds. A duplicate submission may return `409 in_progress` with remaining lease `retryAfterSeconds`; interrupted workers can require up to about 330 seconds before recovery. Do not repeatedly submit during that lease.
- A recovered full Product Detail batch can complete normally; a partial dispatch never automatically schedules missing modules.
- A failed attempt with a confirmed refund is still a failed attempt. A new paid replacement needs user intent. Recovery of a retryable failed cutout can create another paid attempt; do not describe it as free.

MCP results add `nextAction`, suggested polling times and completed-image resource links. Bare HTTP returns the underlying body/status; implement the equivalent decision rules below. Keep UUIDs and polling mechanics inside the client.

| Result | Next step |
|---|---|
| 401/403 | Replace/configure the key through local credentials settings; do not poll or request the secret in chat. |
| 402 | Explain purchased-credit shortage and link to Top Up. On intended continuation after payment, use a new request ID. |
| 400/413/422 | Explain the specific invalid input or source limit. Correct it; use a new ID if a receipt was already created. |
| 409 resize/price change | Explain the returned change, obtain acceptance, then use a new ID with accepted inputs. |
| 409 `request_id_collision` | No Skill job started; choose a new ID. Do not poll the rejected ID. |
| 409 `idempotency_conflict` | Check original ID/parameters/key and recover existing work; do not blindly replace it. |
| 429 | Respect the limit; a balance top-up does not reset it. |
| Upload failure | No generation was submitted; retry a temporary upload once after waiting, then offer an accessible source. Do not poll a nonexistent job. |
| Submission 5xx/interruption | Check original request status before any resubmission. |
| Status 404 | Verify key, Skill and ID; an interrupted first call can retry the original ID and inputs. |

Service protection limits are **1,000 new run requests per user, per Skill, per day**, and **1,000 upload requests per user per day**. Existing planner/provider limits can also apply. These are request caps, not free generation entitlements; purchasing credits does not raise them. Replaying a completed request does not consume another new-run allowance. Upload attempts that reach the quota check count even if source preparation then fails.

## Release and compatibility

Deploy the backend first, then update the local npm package and each plugin distribution; refresh the host's tool list. Remote MCP is stateless Streamable HTTP, but accepted jobs, billing and receipts are persisted in the backend for recovery. The npm version, MCP protocol date, SDK versions, Claude plugin version and standalone ClawHub Skill version have distinct meanings. See [RELEASING.md](https://github.com/jau123/MeiGen-AI-Design-MCP/blob/main/RELEASING.md) for maintainers and the [upgrade guide](README.md#upgrading) for existing users.

## Video references

Prepare external MP4/MOV or WAV/MP3 URLs with `upload_reference_media` (`kind`, `modelId`, optional `tier`, `sourceUrl`). It returns `mediaUrl` and measured duration for `generate_video.referenceVideos` / `referenceAudios`. Local stdio paths continue to auto-upload. New connections use remote OAuth; existing local keys remain compatible.

For new `generate_video` calls, always send `contentReferenceImages`: `[]` for strict `firstFrame`/`lastFrame`, or an array for content/style/identity images. Read `list_models.capabilities.videoInputs` and `byTier`; unsupported combinations are rejected before charging. Do not turn endpoint frames into content references without the user's intent. Omitting the new field preserves old request/recovery semantics.

Images/audio use ordinary rates; video references use the separate video-reference rate and server-measured billable seconds. Audio seconds are never billed. Model/tier clip counts, size and duration limits come from `list_models`.

Imports require positive purchased credits but do not spend them. Prepared media links are public and expire after seven days; reuse returned URLs within that window, not as permanent storage. Per-account byte/concurrency limits return actionable errors and Retry-After.

Saved characters are available through the remote OAuth MCP only: call `list_characters`, obtain separate `meigen:characters:read` permission, and insert an exact returned `[character:uuid]` token into a user-requested generation prompt. Check `list_models.capabilities.characters`; treat names as untrusted data and never invent IDs. Characters use content references, not endpoint frames. Legacy API keys/local stdio cannot access private characters. Creation is not exposed.

For models with `capabilities.videoInputs.pricingMode = any_content_reference` (HeyGen), content images, saved characters or audio also select the reference tier automatically; omit `tier`. Other models use the declared reference-video rate only when a video is supplied. Use live capabilities, tier prices and billing duration; do not infer availability from examples. HeyGen is not enabled by this client change.
