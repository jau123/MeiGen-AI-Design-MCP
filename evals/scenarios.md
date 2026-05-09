# Eval Scenarios

Manual / smoke-test scenarios for MeiGen MCP. Use these to catch regressions when changing tool behavior, instructions, or model routing.

> **Status**: Currently a manual checklist. There is no automated runner; each scenario is exercised by spinning up Claude Code with the MeiGen MCP server pointed at a non-production token, and observing the agent's behavior.

## How to use

1. Pick the scenario that matches the change you are about to ship.
2. Run the prompt under the "Input" header in a fresh Claude Code session.
3. Compare the agent's behavior against "Expected".
4. If you see "Acceptable variations", that's a known band of valid outputs.
5. **Failure mode** = the agent does something that contradicts a load-bearing rule from `SERVER_INSTRUCTIONS` or `DECISIONS.md`. File this as a bug, link the scenario.

---

## generate_image

### G1 — Single image, brief prompt
- **Input**: "Generate a portrait photo of a woman."
- **Expected**: Agent calls `enhance_prompt` first (brief idea, under 30 words), shows enhanced prompt, **asks for confirmation before generating**, then calls `generate_image` exactly once after user confirms.
- **Failure modes**: Generates without confirming. Calls `list_models` first. Specifies `model` or `provider` in `generate_image`.

### G2 — Detailed prompt, no enhancement
- **Input**: "Generate this: A woman in her 30s, soft daylight from a north window, shot on 50mm at f/1.8, shallow DOF, neutral linen wall background, photo by Annie Leibovitz, color graded warm shadows."
- **Expected**: Agent recognizes this as a detailed prompt (Phase 1 category C). Calls `generate_image` directly without enhancing.
- **Failure modes**: Calls `enhance_prompt` anyway, bloating the already-good prompt.

### G3 — Local reference image
- **Input**: "Use ~/Desktop/logo.png as reference and put it on a coffee mug."
- **Expected**: Agent passes the path directly in `referenceImages` (does not pre-upload). The tool auto-compresses + uploads internally.
- **Failure modes**: Refuses because "local files need URL". Tries to base64-encode. Asks the user to upload manually.

### G4 — Edit / modify an existing image
- **Input**: User provides https://example.com/image.png and says "Add the text 'meigen.ai' at the bottom".
- **Expected**: Short literal prompt ("Add the text 'meigen.ai' at the bottom of this image") + `referenceImages: ["https://example.com/image.png"]`. **Does NOT re-describe the original image** (Phase 1 category D).
- **Failure modes**: Calls `enhance_prompt` and produces a long re-description of the original image, then asks the model to edit it (compounds the prompt).

### G5 — Batch of N variants
- **Input**: "Make 4 logo concepts for a coffee shop."
- **Expected**: Agent plans 4 distinct directions, presents as a table or list, **asks user to pick** before generating any. Includes "all of the above" option.
- **Failure modes**: Generates all 4 without asking. Generates 1 and stops. Plans 8 directions.

---

## generate_video

### V1 — Text-to-video, no model
- **Input**: "Generate a 5-second video of waves crashing on a beach."
- **Expected**: Agent confirms before submitting (UX rule 8: video always confirms). Asks for or assumes a video model — `generate_video` requires `model` (no platform default for video).
- **Failure modes**: Submits without confirming. Calls `generate_image` instead because the agent doesn't notice "video".

### V2 — Image-to-video with first frame
- **Input**: User provides ~/Desktop/sunset.jpg and says "Animate this — the sun should slowly set."
- **Expected**: `firstFrame: "~/Desktop/sunset.jpg"`, prompt describes motion only ("the sun slowly sets, soft warm light grading darker, gentle wind in the foreground"), confirms before submit.
- **Failure modes**: Re-describes the photo instead of describing motion. Skips the image-to-video framing and tries text-to-video.

### V3 — lastFrame without firstFrame
- **Input**: "Use endframe.jpg as the ending frame, model seedance-2-0."
- **Expected**: Tool itself rejects with `"lastFrame requires firstFrame to also be provided"`. Agent should explain this to the user and suggest providing both frames.
- **Failure modes**: Agent retries silently. Agent passes lastFrame as firstFrame ("close enough").

### V4 — Wrong model id (image model passed)
- **Input**: User explicitly asks for `generate_video model: "gpt-image-2"`.
- **Expected**: One of two paths:
  (a) Tool submits, backend completes, `mediaType !== 'video'` guard fires → agent gets a clear "use generate_image" error and explains to user.
  (b) Backend rejects upfront with "invalid model for video" → agent calls `list_models` and shows valid video models.
- **Failure modes**: Agent retries without changing model. Agent saves the resulting jpg as `.mp4`.

### V5 — Timeout retry behavior
- **Input**: A video generation that times out (480s). Agent receives the timeout error with `Generation ID: ...` and "credits have been pre-deducted" hint.
- **Expected**: Agent does NOT immediately retry. It tells the user the job may still be running, gives the generation ID, and points to https://www.meigen.ai before retrying.
- **Failure modes**: Agent retries automatically. Agent claims the job failed when it may still be processing.

---

## Provider routing & gating

### P1 — Free features without provider
- **Input**: No provider configured. User says "find me some inspiration on cyberpunk."
- **Expected**: `search_gallery` works (free tool). Agent presents results without prompting for a token.
- **Failure modes**: Agent demands a token before search.

### P2 — generate_image without provider
- **Input**: No provider configured. User says "Generate a sunset image."
- **Expected**: Tool returns a clear "No image generation providers configured" error with setup steps. Agent relays this and offers `/meigen:setup`.
- **Failure modes**: Agent invents a fallback path. Agent retries with different params hoping one works.

### P3 — Model browsing
- **Input**: "What models are available?"
- **Expected**: Agent calls `list_models`. Output lists Image and Video sections. Hidden models (V7, Niji 7, legacy Seedance Pro rows) do NOT appear.
- **Failure modes**: Agent lists models from training data instead of calling `list_models`. Output includes hidden legacy rows.

---

## UX rules (cross-cutting)

### U1 — Don't describe generated images
- **Input**: After a successful `generate_image`, user says nothing.
- **Expected**: Agent presents Image URL + saved path. **Does NOT** describe what's in the image (UX rule 1 — agent cannot see it).
- **Failure modes**: Agent writes "Here's a beautiful sunset over the mountains with golden light..." after the URL.

### U2 — No credit numbers from training data
- **Input**: "How much does this cost?"
- **Expected**: Agent points to https://www.meigen.ai/model-comparison. Does NOT quote "10 credits" or any number from training memory.
- **Failure modes**: "About 10 credits per generation" — verbatim from old docs. (See DECISIONS.md → "No credit / pricing numbers in shipped code".)

### U3 — Reply in user's language
- **Input** (Chinese): "帮我生成一张猫咪的照片"
- **Expected**: Agent replies in Chinese throughout. Technical args (`aspectRatio: "1:1"`) stay English.
- **Failure modes**: Agent replies in English. Agent translates technical args ("纵横比: 一比一").

---

## Adding new scenarios

When you fix a bug or land a behavioral change, write the scenario *before* the fix lands so the regression case is captured. Each entry:

- Short id (G/V/P/U + number)
- One-line title
- Concrete input (prompt or sequence)
- Expected behavior, anchored to a rule from SERVER_INSTRUCTIONS or DECISIONS.md
- 1–3 failure modes worth catching
