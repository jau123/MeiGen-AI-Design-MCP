---
name: Social Thumbnail Workflow
description: >-
  Optional thumbnail planning for short-video platforms and social feeds.
  Use when the user asks for creative help with a "video thumbnail", "短视频封面",
  "竖版海报", "TikTok cover", "Reels cover", "YouTube Shorts thumbnail",
  "social media poster" — anything optimized for 9:16 mobile feed scrolling with
  prominent headline space. Produces high-contrast, headline-friendly cover art
  in 9:16 by default. NOT for: full posters meant for print, photorealistic
  portraits without text overlay intent, horizontal banners — use other skills.
version: 0.1.0
---

# Social Thumbnail Workflow

Generate cover art for short-video platforms (TikTok / Reels / Shorts) or vertical social feeds. Optimized for 9:16, high contrast, big-headline space, and 1-second feed legibility.

## Optional assistant scope

Use this planning workflow only when the caller asks for creative development. A supplied storyboard, prompt set or approved count/budget can call tools directly. Preserve explicit tool/model/provider, prompt, ratio, references and quality choices. Do not impose a new concept-selection or approval step on resolved inputs. Discovery is available to any workflow; delegation is optional. Return handles/results to the caller, which owns previews, downloads and presentation. Visual descriptions require actual inspection.

## Choosing a dedicated Skill

For an unresolved marketing, event or campaign poster with designed text, call `generate_marketing_poster` directly. Use `brand` for the subject, `content` for supplied copy (`autoCopy: false` when exact wording matters), and `extraNotes` for verified details and layout constraints. Put style/design directions in `extraNotes` or `customStyle`; they are not words to print verbatim in the poster. A poster needs only a subject; images are optional. Do not force a generic image-generation agent or prompt-enhancement step. Preserve an upstream workflow's explicit tool/model/provider selection; a resolved generic illustration or image-only cover can still use `generate_image`.

Use `list_skills` for live styles, output specifications and purchased-credit prices. Choose `styleId` by its ID, not the displayed label; omit `styleId` and `customStyle` for Auto. Nonempty `customStyle` overrides the preset. `styleImage` supplies the primary visual style, with written style only as a compatible supplement; never copy its products, claims or wording. `logo` is an exact identity reference and `productImages` identify the subjects. Use actual accessible files or image URLs only. These dedicated tools require a MeiGen key and purchased credits; OpenAI-compatible providers do not run them.

Resolve only missing required information or scope. A supplied count, copy, quality and approved budget do not need another confirmation. Save a UUID `requestId` and exact inputs for each logical poster, then use `check_skill` with `skill: "brand-poster"` and the original ID after interruption. Follow `nextAction`; do not create paid replacements automatically.

## When to trigger

- User says "video thumbnail", "封面", "短视频封面", "Reels cover", "TikTok cover"
- User asks for creative help planning a vertical thumbnail or poster
- User describes content meant for mobile feeds and asks for visual

## Design constraints (apply to every prompt)

1. **Default ratio** — use `aspectRatio: "9:16"` with `generate_image`, or `ratio: "9:16"` with `generate_marketing_poster`, for an unspecified vertical cover; preserve an explicit caller ratio. Do NOT write `--ar 9:16` in the prompt.
2. **High contrast** — bold foreground subject against a strong color-block or gradient background. Tiny details get lost when scaled to a phone-feed thumbnail.
3. **Headline placement** — for an image-only cover or a caller-requested later text overlay, reserve a clear zone for that overlay. For a dedicated marketing poster, supply the visible headline in `content` and any placement direction in `extraNotes`; let the poster workflow lay out the text instead of forcing a blank title area.
4. **One focal point** — feed thumbnails work when the eye lands in <1 second. Don't pack multiple subjects.
5. **Brand-safe color** — when the user gives a brand color, pin it; otherwise default to high-saturation primary palettes (red / cobalt / orange / electric green) over muted tones.

## Workflow

### 1. Clarify intent
Ask only when essential headline or theme information is missing:
- "What's the headline text the cover needs to support?" (lets you reserve the right zone)
- OR if user already gave a clear theme: skip ask, plan directly.

### 2. Reference (optional but recommended)
Call `search_gallery` with the requested poster style or topic for live references. Each page returns at most three entries; use its nextOffset and snapshotId for another batch when requested.

### 3. Plan the requested count; offer directions only when unresolved
Distinct directions, not minor tweaks. For each, write a prompt that:
- Names the focal subject (1 person / 1 object / 1 typographic motif)
- Specifies background (color block / gradient / minimal scene)
- Specifies lighting / mood
- For image-only covers with a later overlay, calls out the headline-safe zone; for dedicated posters, supplies the actual headline and layout directions in their respective fields
- Includes contrast keyword ("high contrast", "bold colors")

### 4. Resolve remaining choices
Proceed when count, inputs and budget are already authorized. Ask only if a required choice remains unresolved.

### 5. Generate
Call the tools directly or delegate when useful. Preserve caller parameters and schedule within authorized scope.

### 6. Deliver
Return task handles, completed URLs and saved paths when available. The caller owns presentation. Inspect before describing visual details; do not add new paid variants automatically.

## Prompt template

For image-only cover art when the caller will add the headline later; do not apply this blank-heading template to a designed marketing poster.

> "[subject — 1 person / 1 object / 1 typographic motif] centered in the lower two-thirds of the frame, [brand-appropriate strong background — bold gradient / color block / minimal scene], [lighting mood — dramatic side-lighting / studio softbox / neon rim-light], high contrast, bold saturated colors, top third intentionally clean for headline overlay, vertical 9:16 social-media-thumbnail composition, eye-catching at small sizes."

## Variants strategy

If the caller asks for three distinct directions, these are possible axes:
- **Variant A: Photo-real** — real-world subject, real lighting
- **Variant B: Stylized illustration** — vector / flat / poster-style
- **Variant C: Typographic-led** — big text or graphic motif as the subject itself

This gives the user genuinely different swings rather than three near-duplicates.

## What to skip

- Preserve the requested output ratio; do not make the user crop a knowingly mismatched result.
- For a designed poster, put the exact headline/copy in `content` and use `autoCopy: false`; selected language can still translate it. Reserve blank headline space for later overlay only when the caller wants image-only cover art.
- Don't choose Niji 7 (retired) or Midjourney V8.1 with anime trigger words unless the user wants anime cover — most TikTok/Reels content is photo-real or graphic
- Preserve the caller-selected model and budget; resolve omitted choices from live capabilities.
