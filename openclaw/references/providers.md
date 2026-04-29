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
| Midjourney V7 | No | **Photorealistic / general aesthetic** |
| Midjourney Niji 7 | No | **Anime and illustration ONLY** |

> **Pricing** for all models is dynamic. See https://www.meigen.ai/model-comparison for the up-to-date credit cost of each model and tier. Run `list_models` from the MCP server to see capabilities (resolutions, quality tiers, aspect ratios) for each model.

> **GPT Image 2.0** accepts `resolution` ("1K" / "2K" / "4K") and `quality` ("low" / "medium") parameters. **Default: 1K / medium** (good for social, chat, blog, web UI). Upgrade resolution for prints/posters only; for drafts/thumbnails use `quality: "low"`.

> **Midjourney V7 vs Niji 7**: Both take ~60s, accept 1 reference image, and return 4 candidate images per generation. Advanced params (stylize/chaos/weird/raw/iw/sw/sv) run with fixed server-side defaults and cannot be tuned from MCP — the only exception is `sref`, which can be set via `--sref <code>` at the end of the prompt (Midjourney style codes only, no URLs). The two differ in **content focus** and **prompt enhancement style**:
>
> - **V7** — general / photorealistic. Use for product photography, portraits, landscapes, cinematic shots. Default stylize is 0 (closer to your prompt). When enhancing, use `style: 'realistic'` in `enhance_prompt`.
> - **Niji 7** — anime / illustration ONLY. Do NOT use for photorealistic, product photography, or non-anime content. Default stylize is 100 (more stylized). When enhancing, ALWAYS use `style: 'anime'` in `enhance_prompt` — the default `realistic` produces prompts poorly suited for anime models.

When no model is specified, the server defaults to GPT Image 2.0.

## Prompt Enhancement Styles

`enhance_prompt` supports three style modes:

| Style | Focus | Best For |
|-------|-------|----------|
| `realistic` | Camera lens, aperture, focal length, lighting direction, material textures | Product photos, portraits, architecture |
| `anime` | Key visual composition, character details (eyes, hair, costume), trigger words | Anime illustrations, character design |
| `illustration` | Art medium, color palette, composition direction, brush texture | Concept art, digital painting, watercolor |
