---
name: Product Photoshoot Workflow
description: >-
  Multi-angle product imagery workflow. Use when the user wants to "shoot a
  product", "make e-commerce product images", "product photography set",
  "电商产品图", "产品多角度图", "brand product visuals", or provides a single
  product photo and asks for marketing-ready variations. Produces 4 distinct
  directions (lifestyle scene, macro detail, scale/context, marketing layout)
  from one reference image. NOT for: portraits, generic illustration, logo
  design, video creation — use other skills or generate_image directly.
version: 0.1.0
---

# Product Photoshoot Workflow

Turn one product reference photo into a brand-ready set of 4 distinct images, each emphasizing a different sales angle.

## When to trigger

- User uploads a product photo and says "make e-commerce images", "design a campaign", "I need product shots"
- User says 电商产品图 / 产品多角度图 / 产品拍摄 / 产品营销图
- Anyone asking for "a set of product images" with a reference attached

## Prerequisites

1. **A reference image is required** — the user MUST provide a product photo (URL or local path). If they have not, ask once: "Please share the product photo you want me to work from." Do NOT try to invent a product without a reference.
2. Confirm provider is configured (any of MeiGen / OpenAI-compatible / ComfyUI). If not, hand off to `/meigen:setup`.

## The 4 directions

Always plan exactly 4 directions in this order. Present as a table to the user and **ask which to generate**(per UX Rule 8 — always confirm before batch). Include "all four in parallel" as an option.

| # | Direction | Aspect | Intent |
|---|-----------|--------|--------|
| 1 | **Lifestyle Scene** | 4:3 or 16:9 | Product placed in its natural use-context (a watch on a wrist, a candle on a coffee table, a bottle on a bar). Soft natural lighting. |
| 2 | **Macro Detail** | 1:1 | Extreme close-up. Material grain, texture, surface reflections. Studio lighting. |
| 3 | **Scale / Context** | 4:3 | Product alongside a familiar object (hand, fruit, ruler) to convey size, OR product on a clean pedestal with subtle shadow. |
| 4 | **Marketing Layout** | 3:4 or 9:16 | Editorial / poster composition — product offset to one side, with negative space for headline text. Strong color block or gradient background. |

## Generation flow

1. **Read user intent** — product type, brand mood (luxury? playful? minimalist?), color palette. Use `search_gallery(category="Product & Brand")` if you need style references; 239 curated examples are available.
2. **Plan and present** — write the 4 prompts (distinct, not just one tweaked four ways) and show them to the user. Each prompt MUST:
   - Reference the input image's product
   - Specify the direction's intent (lifestyle / macro / scale / marketing)
   - Include lighting direction
   - Mention material handling if relevant (matte, glossy, translucent, metallic)
3. **AskUserQuestion** — "Pick directions to generate. All four runs ~4 parallel agents — confirm?"
4. **Generate in parallel** — for the directions chosen, spawn `meigen:image-generator` agents in a single response, each passing the reference image as `referenceImages` and the planned prompt. Omit `aspectRatio` unless the user pinned one — describe the ratio in the prompt instead so each direction gets its own framing.
5. **Present results** — Image URL + saved path for each, grouped by direction label. **Do NOT describe the generated images** (UX Rule 1).

## Prompt templates (starting points — adapt to the actual product)

**Lifestyle Scene:**
> "[product description from reference], placed in [natural context appropriate to product], soft golden-hour daylight from upper left, shallow depth of field, lifestyle editorial photography, 4:3 horizontal composition."

**Macro Detail:**
> "Extreme macro close-up of [product] showing [material — leather grain / metal brushed finish / liquid translucency / etc.], dramatic studio side-lighting, sharp focus on texture, 1:1 square frame, commercial product photography."

**Scale / Context:**
> "[product] on a clean white marble pedestal with [comparison object — e.g., a human hand reaching in / a fresh orange / a small notebook] for scale, even diffuse light, neutral background, professional product catalog photography, 4:3 horizontal."

**Marketing Layout:**
> "[product] positioned in the right third of the frame, large negative space on the left for headline copy, bold color-block background in [brand-appropriate color], dramatic side lighting, magazine campaign style, vertical 3:4 composition."

## Iteration

After the first batch:
- If user likes one direction → offer "extensions" (different angles of the same direction, color variants, seasonal versions)
- If a direction misses → ask what to change (mood / palette / placement) and regenerate ONLY that one
- Never silently regenerate — every retry is explicit

## What to skip

- Don't try to "remove background" or "add text" via generate_image — those are post-processing steps the user does separately
- Don't pick the cheapest model to save credits (UX Rule 5 — default to quality)
- Don't add MidJourney `--ar` or other flags in the prompt — pass `aspectRatio` parameter when needed
