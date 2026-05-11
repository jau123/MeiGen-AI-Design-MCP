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
**Decision**: `generate_image` rejects responses where `status.mediaType === 'video'`; `generate_video` rejects anything that isn't `'video'`. Removed the legacy `videoUrl || status.imageUrl` fallback in 1.3.0.

**Why**: A video-model id passed to `generate_image` (or vice versa) used to silently write a `.jpg` as `.mp4` (or treat a video URL as an image). The fallback was a footgun — better to fail loudly with a helpful redirect ("use generate_video for this model id").

**How to apply**: New media types in the future should add their own dedicated tool + `mediaType` guard, not extend the fallback chain.

### Reference image uploads expire after 24h (R2 contract)
**Decision**: All local reference images uploaded to `gen.meigen.art/api` are pruned by R2 after 24 hours. This is mentioned in tool responses and the README.

**Why**: R2 is a cache, not durable storage. Users sometimes save tool responses and try to reuse the URL days later — failure mode was confusing 404s.

**How to apply**: Don't hand a reference URL back to the user as if it were durable. If we ever need persistence, that's a different storage tier and a real product decision.

### File magic-byte validation on uploads
**Decision**: `processAndUploadImage` validates file headers (JPEG / PNG / WebP / GIF signatures) before compression and upload, not just file extension.

**Why**: Defense against trivially renamed files. A `.jpg` with PE/Mach-O headers has no business going through our compression pipeline or to a third-party CDN.

**How to apply**: When adding new accepted formats (e.g., HEIC), add the corresponding magic bytes to the validator.

### Pinned npx version everywhere except `meigen init` output
**Decision**: All distribution docs (README, plugin/.mcp.json, openclaw/SKILL.md, etc.) pin `meigen@<exact-version>`. Only `src/cli/init.ts` outputs `meigen@latest` because it generates end-user MCP configs that should auto-update.

**Why**: `meigen@latest` in our own distribution channels is a supply-chain risk + stale-cache pain. CI (`.github/workflows/validate.yml`) enforces the pin.

**How to apply**: When adding a new distribution doc that references npm, add it to `scripts/ci/check-pinned-npm.sh:DIST_FILES`. Never use `meigen@latest` outside `init.ts`.

### Categories are 6 (post-2026-04-29 reorg)
**Decision**: Gallery categories: Photography (533), Illustration & 3D (370), Product & Brand (239), Food & Drink (156), Poster Design (146), UI & Graphic (52). Old single-word names (`3D`, `Food`, `Photograph`, `Product`, `Poster`, `Design`) map via `CATEGORY_DISPLAY_MAP` for old data. Retired: `App`, `Girl`, `JSON`, `Other`.

**Why**: Database team rebalanced the 1,446-entry prompt corpus to be more discoverable. Old buckets like `Other` and `JSON` had become catch-alls; `Girl` was poorly defined and mostly redundant with `Illustration & 3D`.

**How to apply**: When adding new categories, update three files in lockstep: `src/lib/prompt-library.ts` (type + `CATEGORY_DISPLAY_MAP`), `src/tools/search-gallery.ts` (Zod enum), `plugin/agents/gallery-researcher.md` (category list). CI doesn't catch this drift yet.

---

## Retired

(Empty — move entries here when their constraint disappears, with a date and one-line postmortem.)
