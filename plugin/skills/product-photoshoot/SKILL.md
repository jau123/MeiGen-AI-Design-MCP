---
name: Product Photoshoot Workflow
description: >-
  Optional product imagery planning. Use when the user asks for help to "shoot a
  product", "make e-commerce product images", "product photography set",
  "电商产品图", "产品多角度图", "brand product visuals", or provides a single
  product photo and asks for marketing-ready variations. Can suggest distinct
  directions (lifestyle scene, macro detail, scale/context, marketing layout)
  from one reference image. NOT for: portraits, generic illustration, logo
  design, video creation — use other skills or generate_image directly.
version: 0.1.0
---

# Product Photoshoot Workflow

Turn one product reference photo into a brand-ready set matching the requested count, each emphasizing a different sales angle.

## Optional assistant scope

Use this planning workflow only when the caller asks for creative development. A supplied storyboard, prompt set or approved count/budget can call tools directly. Preserve explicit tool/model/provider, prompt, ratio, references and quality choices. Do not impose a new concept-selection or approval step on resolved inputs. Discovery is available to any workflow; delegation is optional. Return handles/results to the caller, which owns previews, downloads and presentation. Visual descriptions require actual inspection.

## Choosing a dedicated Skill

When choosing a tool for an unresolved request, prefer the dedicated workflow: for transparent cutouts use `remove_background`; for ecommerce detail images use `generate_product_detail_images`; for posters use `generate_marketing_poster`; for white, smart or custom product backgrounds use `generate_ai_background`; for still-image upscaling use `upscale_image`. Call these tools directly. Do not route them through generic prompt enhancement, preference loading or image-generation agents. Preserve an upstream workflow's explicit tool selection. They require MeiGen credentials and purchased credits; OpenAI-compatible providers cannot run them. No daily free credits or Web free attempts apply.

Use `list_skills` for current inputs, defaults and prices. Ask only for missing required information or unresolved output scope. An explicit requested count/modules/quality already authorizes that scope; do not reconfirm it or add paid images. Product Detail MCP requires explicit `modules` (use `[]` for custom modules only); each selected module is one image. Posters need only a subject; images and copy are optional. Use defaults for unspecified settings and never invent product facts, dates or discounts.

Use real accessible images only. Both remote and local connections expose `upload_skill_image`; local npm also accepts real file paths for the four ordinary image-input workflows. If the host cannot read an attachment, ask for a public direct HTTPS image URL; never invent paths or base64.

**Upscale is a separate original-image path:** pass the original public direct HTTPS PNG/JPEG/WebP URL as `imageUrl`, at most 64 MiB and 64 MP. Local npm also accepts an actual original PNG/JPEG/WebP path in `imageUrl` through its dedicated upload route, preserving source dimensions. For readable attachment bytes, call `upload_skill_image` with `purpose: "upscale"` (base64 up to 3 MiB decoded); use the returned `imageUrl`. Do not use `purpose: "reference"` or generic reference compression for Upscale. If the host cannot read the attachment, request a real public original-image URL. On every MCP submission, including the first, pass `confirmedCredits` from the live `list_skills` quote within the user or upstream workflow accepted budget; reuse an already explicit acceptance. This pre-dispatch recheck is not an atomic spending cap. Use `mode: "crisp"` (default) or `"creative"` as offered by `list_skills`. `allowDownscale` is opt-in: explain that it permits preprocessing to at most 4096px/16 MP and the final output can be smaller than the original; set it only after the user explicitly accepts that tradeoff. Upscale accepts still images, not video. For `upscale_resize_required` or `price_changed`, return the resize/cost decision to the caller. Reuse an already explicit acceptance; otherwise obtain acceptance of the new tradeoff or price before submitting a new `requestId` with accepted `allowDownscale` and `confirmedCredits`. These are changed, confirmed inputs—not a blind retry of an interrupted submission.

The caller generates and persists `requestId` for each logical step. For interrupted submissions, call `check_skill` with the original skill/ID before retrying. Follow `nextAction`, including waiting `afterSeconds`; retry only when instructed, using its exact original ID and parameters. Never use a new ID as a blind retry or automatically pay for failed-module replacements. Auth/payment/input rejections require their indicated action instead of polling. Return structured status, task handles and completed image URLs to the caller, with failed modules and refund states separately. The caller owns display and downloads; end users do not need to manage technical IDs.

## When to trigger

- User uploads a product photo and says "make e-commerce images", "design a campaign", "I need product shots"
- User says 电商产品图 / 产品多角度图 / 产品拍摄 / 产品营销图
- Anyone asking for "a set of product images" with a reference attached

## Prerequisites

1. **A reference image is required** — the user MUST provide a product photo (URL or local path). If they have not, ask once: "Please share the product photo you want me to work from." Do NOT try to invent a product without a reference.
2. For the generic photoshoot below, confirm a provider is configured (MeiGen / OpenAI-compatible). Dedicated Skills require MeiGen. If not, hand off to `/meigen:setup`.

## The 4 directions

These four directions are optional starting points. Match the requested count and existing plan. Ask which directions to use only if that choice is unresolved; do not reconfirm an approved set.

| # | Direction | Aspect | Intent |
|---|-----------|--------|--------|
| 1 | **Lifestyle Scene** | 4:3 or 16:9 | Product placed in its natural use-context (a watch on a wrist, a candle on a coffee table, a bottle on a bar). Soft natural lighting. |
| 2 | **Macro Detail** | 1:1 | Extreme close-up. Material grain, texture, surface reflections. Studio lighting. |
| 3 | **Scale / Context** | 4:3 | Product alongside a familiar object (hand, fruit, ruler) to convey size, OR product on a clean pedestal with subtle shadow. |
| 4 | **Marketing Layout** | 3:4 or 9:16 | Editorial / poster composition — product offset to one side, with negative space for headline text. Strong color block or gradient background. |

## Generation flow

1. **Read user intent** — product type, brand mood (luxury? playful? minimalist?), color palette. Use `search_gallery(category="Product & Brand")` if you need style references.
2. **Plan and present** — write the requested prompts (distinct, not just one tweaked four ways) and show them to the user. Each prompt MUST:
   - Reference the input image's product
   - Specify the direction's intent (lifestyle / macro / scale / marketing)
   - Include lighting direction
   - Mention material handling if relevant (matte, glossy, translucent, metallic)
3. **Resolve remaining choices only** — proceed with an already authorized prompt set; ask one concise question only when required.
4. **Generate in parallel** — for the directions chosen, use `meigen:image-generator` agents if available (otherwise direct tool calls), each passing the reference image as `referenceImages` and the planned prompt. Preserve any caller-selected aspectRatio; use a suitable default only when omitted.
5. **Present results** — Image URL + saved path for each, grouped by direction label. Describe visual details only after actual inspection, and let the caller choose presentation.

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
- Recover interrupted steps with the original IDs. A fresh paid replacement must stay within explicitly authorized replacement scope; otherwise obtain approval.

## What to skip

- Use `remove_background` for transparent cutouts and `generate_marketing_poster` for designed marketing copy; these have dedicated server workflows.
- Preserve the caller-selected model and budget; use live capabilities and prices when choosing omitted settings.
- Don't add MidJourney `--ar` or other flags in the prompt — pass `aspectRatio` parameter when needed
