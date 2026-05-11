---
name: Social Thumbnail Workflow
description: >-
  Vertical-format thumbnail and poster workflow for short-video platforms and
  social feeds. Use when the user asks for a "video thumbnail", "短视频封面",
  "竖版海报", "TikTok cover", "Reels cover", "YouTube Shorts thumbnail",
  "social media poster" — anything optimized for 9:16 mobile feed scrolling with
  prominent headline space. Produces high-contrast, headline-friendly cover art
  in 9:16 by default. NOT for: full posters meant for print, photorealistic
  portraits without text overlay intent, horizontal banners — use other skills.
version: 0.1.0
---

# Social Thumbnail Workflow

Generate cover art for short-video platforms (TikTok / Reels / Shorts) or vertical social feeds. Optimized for 9:16, high contrast, big-headline space, and 1-second feed legibility.

## When to trigger

- User says "video thumbnail", "封面", "短视频封面", "Reels cover", "TikTok cover"
- User mentions "9:16" or "vertical poster" or "竖版海报"
- User describes content meant for mobile feeds and asks for visual

## Design constraints (apply to every prompt)

1. **9:16 aspect ratio** — pass `aspectRatio: "9:16"` explicitly to every `generate_image` call. Do NOT write `--ar 9:16` in the prompt.
2. **High contrast** — bold foreground subject against a strong color-block or gradient background. Tiny details get lost when scaled to a phone-feed thumbnail.
3. **Headline-friendly composition** — leave a clear zone (top third or bottom third) for the user's title text. Mention this explicitly in the prompt: "leave top third clear for headline overlay".
4. **One focal point** — feed thumbnails work when the eye lands in <1 second. Don't pack multiple subjects.
5. **Brand-safe color** — when the user gives a brand color, pin it; otherwise default to high-saturation primary palettes (red / cobalt / orange / electric green) over muted tones.

## Workflow

### 1. Clarify intent
Ask ONE question (per UX Rule 4 — don't batch-ask):
- "What's the headline text the cover needs to support?" (lets you reserve the right zone)
- OR if user already gave a clear theme: skip ask, plan directly.

### 2. Reference (optional but recommended)
Call `search_gallery(category="Poster Design")` for style reference; 146 curated entries are available. Show 3-5 thumbnails to the user if they want to pick a direction.

### 3. Plan 2-3 variants (default 3)
Distinct directions, not minor tweaks. For each, write a prompt that:
- Names the focal subject (1 person / 1 object / 1 typographic motif)
- Specifies background (color block / gradient / minimal scene)
- Specifies lighting / mood
- Calls out the headline-safe zone explicitly
- Includes contrast keyword ("high contrast", "bold colors")

### 4. AskUserQuestion before generating
"Pick 1 to generate first, or all 3 in parallel — which?"

### 5. Generate
Spawn `meigen:image-generator` agents. Always pass `aspectRatio: "9:16"`.

### 6. Deliver
Image URL + saved path. **Do NOT describe the generated image** (UX Rule 1). Suggest next step: "Want me to generate variants with the headline text rendered in? Note: text rendering is best on GPT Image 2 or Midjourney V8.1."

## Prompt template

> "[subject — 1 person / 1 object / 1 typographic motif] centered in the lower two-thirds of the frame, [brand-appropriate strong background — bold gradient / color block / minimal scene], [lighting mood — dramatic side-lighting / studio softbox / neon rim-light], high contrast, bold saturated colors, top third intentionally clean for headline overlay, vertical 9:16 social-media-thumbnail composition, eye-catching at small sizes."

## Variants strategy

When generating 3 variants, force them along these axes:
- **Variant A: Photo-real** — real-world subject, real lighting
- **Variant B: Stylized illustration** — vector / flat / poster-style
- **Variant C: Typographic-led** — big text or graphic motif as the subject itself

This gives the user genuinely different swings rather than three near-duplicates.

## What to skip

- Don't generate at 16:9 and ask user to crop — pass 9:16 directly
- Don't put the entire headline text into the image prompt (GPT Image 2 can render short text, but generally headline overlay is added in post)
- Don't choose Niji 7 (retired) or Midjourney V8.1 with anime trigger words unless the user wants anime cover — most TikTok/Reels content is photo-real or graphic
- Don't pick the cheapest model (UX Rule 5)
