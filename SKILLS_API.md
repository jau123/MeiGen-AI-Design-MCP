# Visual Skills guide

MeiGen provides five focused image workflows alongside image and video generation. Use them through your existing [MCP connection](SETUP.md); native remote connections and the 4.0 bridge use the same hosted tools.

## Choose a workflow

| Workflow | Tool | Example request |
| --- | --- | --- |
| Remove Background | `remove_background` | “Remove the background from this product photo and keep it transparent.” |
| Product Detail Images | `generate_product_detail_images` | “Create three product images: a hero shot, a close-up and a lifestyle scene.” |
| Marketing Poster | `generate_marketing_poster` | “Make a poster for our coffee tasting using this headline and schedule.” |
| AI Backgrounds | `generate_ai_background` | “Place this product on a sunlit stone counter.” |
| Upscale | `upscale_image` | “Upscale this photo while preserving its original details.” |

Provide a source image for cutouts, product images, backgrounds and upscaling. Posters can start from a written brief; logos, product photos and style references are optional when supported.

## Before generating

Use `list_skills` for current required inputs, options, output specifications and prices. Follow the connected tool's schema rather than copying parameters from old examples. All five workflows use **purchased MeiGen credits**; daily free credits and Web free attempts do not apply.

Keep the user's supplied wording, selected workflow, references and image count. Resolve missing materials or spending outside the approved scope before starting. Product Detail Images can produce multiple paid outputs: choose the requested modules and count explicitly.

For ordinary image/video generation, use `list_models` when current model capabilities or prices are needed. See [workflow composition](COMPOSABLE_WORKFLOWS.md) for chaining completed results.

## Reference images and copy

- The remote service cannot read local file paths. Use readable host attachments with a supported upload tool, or an accepted direct HTTPS image URL.
- Use `upload_skill_image` when reference preparation is needed; inspect its schema and use its returned URL. Do not invent URLs or ask users to type base64.
- Keep the original image for Upscale. Explain and obtain acceptance for any required resizing or price change before continuing; use the live quote for `confirmedCredits`.
- Keep exact poster wording separate from design instructions: `content` with `autoCopy: false` supplies visible text; `extraNotes` and `customStyle` describe the design. Follow the selected language settings.
- Treat product images and logos as identity references, and style images as visual direction. Do not invent product claims, discounts or event details.
- Keep source files and download results you want to retain. A media URL is not a permanent-storage guarantee; public links may be viewed by anyone who has them.

## Recover an interrupted task

Save one `requestId` and the exact inputs for each intended paid attempt before submitting. Keep the returned task handles. A submission receipt is not a completed image.

Use `check_skill` with the original Skill and request ID after an interruption; ordinary generations use `check_generation`. Follow returned status, `nextAction` and retry guidance. Do not create a new paid attempt merely because a response was lost.

| Situation | Action |
| --- | --- |
| Sign-in or permission error | Reconnect through the host and check the account or required consent. Never paste credentials into chat. |
| Insufficient purchased credits | Check the same account's balance before an intended new attempt. |
| Invalid input, changed price or required resize | Explain the returned requirement and resolve it before a new submission. |
| Rate limit | Wait as instructed by the service. |
| Timeout or uncertain submission | Check the original task before resubmitting. |
| Partial completion | Keep available results and report remaining failures individually. |
| Failed or unavailable result | Report the actual status and any confirmed refund; a replacement needs user intent. |

The client controls previews and downloads. Inspect results before describing their contents, and save favorites only when requested or previously authorized.

## Existing direct HTTP integrations

Legacy API-key integrations can consult the [versioned HTTP reference](https://github.com/jau123/MeiGen-AI-Design-MCP/blob/v3.4.0/SKILLS_API.md). It documents that release, not a guarantee of current options or prices. Prefer remote MCP and live discovery for new integrations; see [migration](MIGRATION.md) for retained compatibility and limitations.
