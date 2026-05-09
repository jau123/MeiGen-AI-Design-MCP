# Provider Comparison & Configuration

## Provider Comparison

| | MeiGen Platform | OpenAI-Compatible | ComfyUI (Local) |
|---|---|---|---|
| **Models** | GPT Image 2.0, Nanobanana 2, Seedream 5.0, etc. | Any model at the endpoint | Any checkpoint on your machine |
| **Reference images** | Native support | Depends on your model/provider | Requires LoadImage node |
| **Concurrency** | Up to 4 parallel | Up to 4 parallel | 1 at a time (GPU constraint) |
| **Latency** | 10-30s typical | Varies by provider | Depends on hardware |
| **Cost** | Credits (see [pricing](https://www.meigen.ai/model-comparison)) | Provider billing | Free (your hardware) |
| **Offline** | No | No | Yes |

## Alternative Provider Configuration

Save to `~/.config/meigen/config.json`:

**OpenAI-compatible API (Together AI, Fireworks AI, DeepInfra, etc.):**

```json
{
  "openaiApiKey": "sk-...",
  "openaiBaseUrl": "https://api.together.xyz/v1",
  "openaiModel": "black-forest-labs/FLUX.1-schnell"
}
```

**Local ComfyUI:**

```json
{
  "comfyuiUrl": "http://localhost:8188"
}
```

Import workflows with the `comfyui_workflow` tool (action: `import`). The server auto-detects key nodes (KSampler, CLIPTextEncode, EmptyLatentImage) and fills in prompt, seed, and dimensions at runtime.

Multiple providers can be configured simultaneously. Auto-detection priority: MeiGen > ComfyUI > OpenAI-compatible.

## MeiGen Models

| Model | 4K | Best For |
|-------|-----|----------|
| GPT Image 2.0 (default) | Yes | **Near-perfect text rendering** in posters/logos |
| Nanobanana 2 | Yes | General purpose, high quality |
| Nanobanana Pro | Yes | Premium quality |
| Seedream 5.0 Lite | Yes | Fast, stylized imagery |
| Seedream 4.5 | Yes | Previous-gen alternative |
| Midjourney V8.1 | No | **Unified general-purpose** — photorealistic + stylized/anime in one model |
| Flux 2 Klein | No | **Cheapest fast draft** — text-to-image only |

> **Pricing** for all models is dynamic. See https://www.meigen.ai/model-comparison for the up-to-date credit cost of each model and tier. Run `list_models` from the MCP server to see capabilities (resolutions, quality tiers, aspect ratios) for each model.

> **GPT Image 2.0** accepts `resolution` (e.g. `"1K"` / `"2K"` / `"4K"`) and `quality` (e.g. `"low"` / `"medium"` / `"high"`) parameters. Defaults and supported tiers are decided by the MeiGen backend per model — run `list_models` for the current capabilities. Typical default is `1K / medium` (good for social, chat, blog, web UI). Upgrade resolution for prints/posters only; for drafts/thumbnails use `quality: "low"`.

> **Midjourney V8.1**: Unified general-purpose Midjourney model. ~45s, accepts max 1 reference image, returns 4 candidate images per generation. Handles **both** photorealistic AND stylized/anime content in one model — there is no separate Niji model exposed via MCP. Advanced params (stylize/chaos/weird/raw/iw/sw/sv/quality) run with fixed server-side defaults and cannot be tuned from MCP. The only exception is `sref`, settable via `--sref <code>` at the end of the prompt (Midjourney style codes only — numeric or text; no URLs or local paths). Other Midjourney flags (`--ar`, `--chaos`, `--niji`, `--seed`, etc.) and legacy syntax (`::N` weights, `[a|b]` permutations) are silently stripped by the server. Pass `style: 'realistic'` to `enhance_prompt` for general intent, `style: 'anime'` for anime/illustration — V8.1 follows the prompt and benefits from explicit anime trigger words for stylized output.

When no model is specified, the server defaults to GPT Image 2.0.

## Prompt Enhancement Styles

`enhance_prompt` supports three style modes:

| Style | Focus | Best For |
|-------|-------|----------|
| `realistic` | Camera lens, aperture, focal length, lighting direction, material textures | Product photos, portraits, architecture |
| `anime` | Key visual composition, character details (eyes, hair, costume), trigger words | Anime illustrations, character design |
| `illustration` | Art medium, color palette, composition direction, brush texture | Concept art, digital painting, watercolor |
