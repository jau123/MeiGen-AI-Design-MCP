# Key Decisions (Do Not Revisit Without Data)

This file records load-bearing design decisions and their rationale. **Each entry should be a defended choice — preferably backed by an incident, a number, or a stakeholder constraint.** Adding to this list means the next contributor cannot revert without showing other numbers or surfacing a new incident.

When a decision becomes obsolete (the constraint disappears, the data flips), move the entry to "## Retired" with a date and a one-line postmortem rather than deleting it.

---

## Active

### No MCP-side defaults for backend-owned values
**Decision**: `generate_image` only sends `modelId` / `resolution` / `quality` to the backend when the user explicitly passes them. No fallback values in `meigen-api.ts`.

**Why**: The 1.2.9 → 1.2.10 hotfix. MCP shipped with a `2K` fallback that overrode the backend's per-model `defaultResolution`, silently doubling credit cost on every gpt-image-2 call for two days before discovery.

**How to apply**: When adding a new backend-owned parameter, never add a `||` fallback in MCP. Pass through user input only. If the backend needs a default, it provides one.

### No credit / pricing numbers in shipped code (live data is fine, training data is not)
**Decision**: All **hardcoded** credit prices ("10 credits per generation", "2 credits", etc.) have been removed from MCP code, instructions, and docs (1.2.11). Pricing references in narrative/instructions point to https://www.meigen.ai/model-comparison.

**Updated 1.3.0**: `list_models` **may** render the `credits_per_generation` field returned by the backend at request time, because that number comes from live data — when the price changes, the next `list_models` call reflects it. The rule is about *frozen* numbers in shipped strings, not about *displaying* numbers the backend sends.

**Why**: npm packages have a long tail of stale versions. A hardcoded "10 credits" in 1.2.9 keeps misleading users for months after the price changes. **Worse than no number** because users trust shipped tooling more than a website disclaimer. But a number sourced from `apiClient.listModels()` is current by construction.

**How to apply**:
- ✅ Render `m.credits_per_generation` in `list_models` output (sourced from backend at call time).
- ✅ Quote `creditsUsed` from a generation response (sourced from backend per request).
- ❌ Write a specific credit number in `SERVER_INSTRUCTIONS`, tool descriptions, `enhance_prompt` text, or README. Those are frozen at npm release time.
- ❌ Add a `defaultCredits` fallback in MCP code that runs when the backend doesn't return a number — let backend handle absence.

### Schema uses `z.string().optional()` not `z.enum([...])` for backend-dependent fields
**Decision**: For `resolution`, `quality`, `tier`, `duration` and similar, the Zod schema is `z.string().optional()` / `z.number().int().positive()`, not `z.enum(['fast', 'pro'])` or `z.number().min(3).max(15)`.

**Why**: Enums freeze the valid set at MCP release time. When the backend adds a new tier (e.g., seedance gains a `cinema` tier), MCP must publish a new version before users can use it. Same principle as "no MCP-side defaults".

**How to apply**: Use `.describe()` to document *typical* current values; let the backend reject invalid input. Never list the valid set in an enum.

### One shared API semaphore across image + video tools
**Decision**: `generate_image` and `generate_video` share `sharedApiSemaphore` (in `src/lib/generation-shared.ts`), max 4 concurrent submissions.

**Why**: Both tools call the same backend endpoint (`/api/generate/v2`) and share the same per-user rate limit (12 req/min). Two independent `Semaphore(4)` instances let MCP burst to 8 concurrent submits, tripping 429. We had this latent bug from `1.2.13` → 1.3.0 — the comment claimed the semaphores were shared, but they weren't.

**How to apply**: When adding a new generation tool that hits `/api/generate/v2`, import `sharedApiSemaphore`, don't create a fresh one.

### Midjourney V8.1 unified, no Niji exposed via MCP (2026-04, commit 79bca3c)
**Decision**: V8.1 replaces V7 in user-facing docs. Niji 7 is hidden via `extra_config.hidden=true` server-side and removed from skills/instructions.

**Why**: V8.1 is a single Midjourney engine that handles photorealistic AND stylized/anime intent based on prompt content. Maintaining a separate Niji exposure doubled documentation surface area without a quality benefit — V8.1 + explicit anime trigger words match Niji 7 quality in side-by-side tests.

**How to apply**: When documenting Midjourney, refer only to V8.1. The `style: 'anime'` mode in `enhance_prompt` injects anime trigger words; that is the path for stylized output, not a model switch.

### Backend `mediaType` is the source of truth for image vs. video output
**Decision**: Preserve a completed job's actual `mediaType`, URLs and success state. Keep the tool's original intent as `requestedMediaType`; when the two differ, return `nextAction: review_media_type` instead of automatically advancing or submitting another job. Local filenames use the actual media type.

**Why**: A media mismatch may already have incurred a charge. The 1.4.0 tools returned the existing result with a warning; the initial 2.0.0 refactor lost that warning. Treating the artifact as failed or silently starting a replacement would lose paid work or create another charge. A warning after completion is not a pre-charge model validation guarantee.

**How to apply**: Preserve intent independently of the initial submission response, which may already report a different actual media type. Test both directions, terminal dedupe and recovery. Missing URLs and provider failures keep their own recovery/error actions.

### Observation retries never repeat a paid submission
**Decision**: Local MeiGen waiting retries transient status-query errors only, stopping after three consecutive errors. A valid status resets that counter. Use increasing delays, honor a larger `Retry-After`, and include queries/backoff in the overall observation deadline. Caller cancellation and terminal errors stop immediately.

**Why**: A temporary gateway failure is not evidence that the paid generation failed. On observation interruption preserve `requestId`/`generationId` and return a recovery action. Neither a deadline nor a cancellation proves server-side cancellation or refund.

### A missing recovery endpoint is not a missing request
**Decision**: Only the authenticated recovery endpoint's JSON `success: false`, `code: request_not_found` with HTTP 404 allows same-ID submission recovery. An HTML or unrecognized JSON 404 returns `endpoint_unavailable` / `check_backend`; it never permits an automatic paid POST.

**Why**: A missing route after deployment/rollback says nothing about an existing charged job. Deploy the compatible backend before distributing npm 2.0.0 and preserve recovery routes when rolling back. Existing compatible POST idempotency can prevent duplicate charges, but an arbitrary 404 is not proof of that backend guarantee.

**How to apply**: Keep IDs and exact inputs while the operator verifies the configured API URL and restores the compatible endpoint. Known `generationId` status can still use the existing status route. Do not require withdrawal of packages already installed by users.

### Reference uploads have no promised archival lifetime
**Decision**: Do not promise either deletion after 24 hours or permanent retention. Reference URLs may remain available, but the API does not guarantee their storage lifetime.

**Why**: The uploads prefix has no verified 24-hour cleanup contract. A stated expiry must come from a verified lifecycle rule, not an assumption.

**How to apply**: Preserve accepted URLs for retries, retain original files, and download outputs that need to be kept. If a source becomes unavailable, recover any accepted job before considering a new attempt.

### File magic-byte validation on uploads
**Decision**: `processAndUploadImage` validates file headers (JPEG / PNG / WebP / GIF signatures) before compression and upload, not just file extension.

**Why**: Defense against trivially renamed files. A `.jpg` with PE/Mach-O headers has no business going through our compression pipeline or to a third-party CDN.

**How to apply**: When adding new accepted formats (e.g., HEIC), add the corresponding magic bytes to the validator.

### Pinned npx version everywhere except `meigen init` output
**Decision**: All distribution docs (README, plugin/.mcp.json, openclaw/SKILL.md, etc.) pin `meigen@<exact-version>`. Only `src/cli/init.ts` outputs `meigen@latest` because it generates end-user MCP configs that should auto-update.

**Why**: `meigen@latest` in our own distribution channels is a supply-chain risk + stale-cache pain. CI (`.github/workflows/validate.yml`) enforces the pin.

**How to apply**: When adding a new distribution doc that references npm, add it to `scripts/ci/check-pinned-npm.sh:DIST_FILES`. Never use `meigen@latest` outside `init.ts`.

### Reference video/audio: arrays with the legacy scalar kept, and no per-model enums (2026-09)
**Decision**: `generate_video` takes `referenceVideos` and `referenceAudios` as `z.array(z.string()).max(10).optional()`. The old scalar `referenceVideo` is kept **forever** as an alias (it must equal the first array entry when both are sent, otherwise `invalid_reference` before any upload), and `referenceVideoDuration` stays accepted-and-ignored. The schema carries no per-model caps: not the clip counts (Seedance 2.0 allows 3, 2.5 allows 10), not the per-clip or total seconds, not the audio formats. `.max(10)` is only a transport sanity bound; the real limits come from `list_models` and the backend rejects an over-limit request before charging.

**Why**: Two rules meeting. (1) "No MCP-side defaults / no enums for backend-dependent fields" — a `z.array(...).max(3)` would have frozen Seedance 2.0's cap into every shipped npm version, and Seedance 2.5 (10 clips, 30s) would have needed a release before anyone could use it. (2) npm has a long stale tail: a caller pinned to an old version must keep working, so a scalar that shipped in a released schema is never removed, and an empty array is never emitted in its place (`referenceVideos: []` would change the request fingerprint and the submitted body, i.e. the paid identity of a retry).

**How to apply**: New per-model reference limits go into `capabilities.video` on `/api/models` and are rendered by `list_models`, never into the Zod schema. When adding another reference kind, append its body key **after** the existing ones in `meigen-api.ts:generateVideo` so a legacy-shaped body still serializes byte-identically, give it its own write-once receipt file (like `video-references.json` / `audio-references.json`) rather than changing `references.json`, and include its identities as a separate fingerprint sub-array that is omitted when empty.

### Reference clips: images.meigen.ai only, and local clips are fingerprinted by streaming (2026-09-17)
**Decision**: `referenceVideos` / `referenceAudios` (and the legacy `referenceVideo` scalar) given as URLs must be `https://images.meigen.ai/...`; any other host fails locally with the same guidance the backend would give. Local file paths are still uploaded automatically. Local clips are fingerprinted **sequentially with a streaming SHA-256** (only the first 12 bytes are held for container detection); the upload step re-reads one clip at a time and re-hashes it before the PUT, raising `reference_changed` on mismatch.

**Why**: The backend's authoritative duration probe only fetches from our own CDN (SSRF whitelist), so an external URL is a guaranteed pre-charge 400 — failing fast keeps a confused request away from a paid submission without widening the whitelist. The previous `Promise.all` + full `Buffer` read held up to 10 × 200 MiB at once and could OOM the MCP host on a legitimate request.

**How to apply**: Keep `MEDIA_REFERENCE_HOST` in `src/lib/generation-references.ts` in sync with the backend probe whitelist (`src/lib/mp4-duration.ts` / `audio-duration.ts` in the Web repo). Never reintroduce a bytes-carrying `MediaReference`; anything that needs the clip's bytes must read them at upload time and verify the fingerprint first.


---

## Retired

### Bundled gallery categories (retired 2026-10-10)

The old six-category snapshot and its local category mapping were removed with the bundled prompt library. Online semantic search is the source of gallery results; the legacy category input is retained only as a search topic, not a strict filter.
