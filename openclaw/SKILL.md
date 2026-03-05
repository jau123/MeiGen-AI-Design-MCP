---
name: "AI Image Generator & Editor — Nanobanana, GPT Image, ComfyUI"
description: Generate images from text with multi-provider routing — supports Nanobanana 2, Seedream 5.0, GPT Image, and local ComfyUI workflows. Includes 1,300+ curated prompts and style-aware prompt enhancement. Use when users want to create images, design assets, enhance prompts, or manage AI art workflows.
version: 1.0.8
homepage: https://github.com/jau123/MeiGen-AI-Design-MCP
metadata: {"clawdbot":{"emoji":"🎨","requires":{"bins":["mcporter","npx","node"],"env":["MEIGEN_API_TOKEN"]},"primaryEnv":"MEIGEN_API_TOKEN"}}
---

# Creative Toolkit

Generate professional AI images through a unified interface that routes across multiple providers. Search curated prompts, enhance ideas into production-ready descriptions, and manage local ComfyUI workflows — all from a single MCP server.

## Quick Start

Add the MCP server to your mcporter config (`~/.config/mcporter/config.json`):

```json
{
  "mcpServers": {
    "creative-toolkit": {
      "command": "npx",
      "args": ["-y", "meigen@1.2.4"],
      "env": {
        "MEIGEN_API_TOKEN": "${MEIGEN_API_TOKEN}"
      }
    }
  }
}
```

Set your API token in `~/.clawdbot/.env` or shell environment:

```bash
export MEIGEN_API_TOKEN="meigen_sk_..."
```

Generate your first image:

```bash
mcporter call creative-toolkit.generate_image prompt="a minimalist perfume bottle on white marble, soft directional lighting, product photography"
```

Or try it without any config (ad-hoc stdio mode):

```bash
mcporter call --stdio "npx -y meigen@1.2.4" generate_image prompt="a ceramic vase with morning light"
```

No API key? Free tools still work:

```bash
mcporter call creative-toolkit.search_gallery query="cyberpunk"
mcporter call creative-toolkit.enhance_prompt brief="a cat in space" style="realistic"
```

## Setup

### Get an API Token

1. Visit [meigen.ai](https://www.meigen.ai) → sign in → click avatar → **Settings** → **API Keys**
2. Create a new key (starts with `meigen_sk_`)
3. Set as environment variable or save to config:

```bash
# Shell environment or ~/.clawdbot/.env
export MEIGEN_API_TOKEN="meigen_sk_..."
```

Or save to `~/.config/meigen/config.json`:

```json
{
  "meigenApiToken": "meigen_sk_..."
}
```

### Alternative Providers

You can use your own OpenAI-compatible API or a local ComfyUI instance instead of — or alongside — the default provider. Save to `~/.config/meigen/config.json`:

**OpenAI / Together AI / Fireworks AI:**

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

Multiple providers can be configured simultaneously. Auto-detection priority: MeiGen > ComfyUI > OpenAI.

## Available Tools

### Free — no API key required

| Tool | What it does |
|------|-------------|
| `search_gallery` | Semantic search across AI image prompts — finds conceptually similar results, not just keyword matches. Also supports category filtering and curated browsing. Returns prompt text, thumbnails, and metadata. |
| `get_inspiration` | Get the full prompt and high-res images for any gallery entry. Use after `search_gallery` to get copyable prompts. |
| `enhance_prompt` | Expand a brief idea (e.g. "a cat in space") into a detailed, style-aware prompt with lighting, composition, and material directions. Supports three styles: realistic, anime, illustration. |
| `list_models` | List all available models across configured providers with capabilities and supported features. |

### Requires configured provider

| Tool | What it does |
|------|-------------|
| `generate_image` | Generate an image from a text prompt. Automatically routes to the best available provider. Supports aspect ratio, seed, and reference images. |
| `upload_reference_image` | Compress a local image (max 2MB, 2048px) so it can be used as a style reference in `generate_image`. Requires explicit user invocation. |
| `comfyui_workflow` | List, view, import, modify, and delete ComfyUI workflow templates. Modify parameters like steps, CFG scale, sampler, and checkpoint without editing JSON. |

## Usage Patterns

### Basic generation

```
Generate a product photo of a ceramic vase with morning light
```

The server picks the best provider, generates the image, and returns a URL + local file path.

### Prompt enhancement then generation

For brief ideas, enhance first for much better results:

```
1. enhance_prompt brief="futuristic city" style="realistic"
   → Returns detailed prompt with camera lens, lighting setup, atmospheric effects

2. generate_image prompt="<enhanced prompt>" aspectRatio="16:9"
   → Generates with the enhanced prompt
```

### Style reference workflow

Use an existing image to guide the visual style of generation:

```
1. upload_reference_image filePath="~/Desktop/my-logo.png"
   → Compresses and returns a reference ID

2. generate_image prompt="coffee mug mockup with this logo" referenceImages=["<id>"]
   → Generates using the reference for style guidance
```

### Gallery exploration

Semantic search understands intent — "dreamy portrait with soft light" finds relevant results even without exact keyword matches:

```
1. search_gallery query="dreamy portrait with soft light"
   → Finds semantically similar prompts with thumbnails

2. search_gallery category="Product & Brand"
   → Browse by category from 1,300+ curated prompts

3. get_inspiration id="<entry_id>"
   → Get full prompt text — copy and modify for your own generation
```

### ComfyUI workflows

```
1. comfyui_workflow action="list"
   → See saved workflows

2. comfyui_workflow action="view" name="txt2img"
   → See adjustable parameters (steps, CFG, sampler, checkpoint)

3. comfyui_workflow action="modify" name="txt2img" modifications={"steps": 30, "cfg": 7.5}
   → Adjust without editing JSON

4. generate_image prompt="..." workflow="txt2img"
   → Generate using the custom workflow
```

## Provider Comparison

| | MeiGen Platform | OpenAI-Compatible | ComfyUI (Local) |
|---|---|---|---|
| **Models** | Nanobanana 2, Seedream 5.0, GPT Image 1.5, etc. | Any model at the endpoint | Any checkpoint on your machine |
| **Reference images** | Native support | gpt-image-1.5 only | Requires LoadImage node |
| **Concurrency** | Up to 4 parallel | Up to 4 parallel | 1 at a time (GPU constraint) |
| **Latency** | 10-30s typical | Varies by provider | Depends on hardware |
| **Cost** | Token-based credits | Provider billing | Free (your hardware) |
| **Offline** | No | No | Yes |

## MeiGen Model Pricing

| Model | Credits | 4K | Best For |
|-------|---------|-----|----------|
| Nanobanana 2 (default) | 5 | Yes | General purpose, high quality |
| Seedream 5.0 Lite | 5 | Yes | Fast, stylized imagery |
| GPT Image 1.5 | 2 | No | Budget-friendly |
| Nanobanana Pro | 10 | Yes | Premium quality |
| Seedream 4.5 | 5 | Yes | Stylized, wide ratio support |
| Midjourney Niji 7 | 15 | No | Anime and illustration |

When no model is specified, the server defaults to Nanobanana 2.

## Prompt Enhancement Styles

`enhance_prompt` supports three style modes, each producing different types of detail:

| Style | Focus | Best For |
|-------|-------|----------|
| `realistic` | Camera lens, aperture, focal length, lighting direction, material textures | Product photos, portraits, architecture |
| `anime` | Key visual composition, character details (eyes, hair, costume), trigger words | Anime illustrations, character design |
| `illustration` | Art medium, color palette, composition direction, brush texture | Concept art, digital painting, watercolor |

## Security & Privacy

**Pinned package**: This skill runs as an MCP server via `npx meigen@1.2.4` (pinned version, not floating). The package is published on [npmjs.com](https://www.npmjs.com/package/meigen) with full source code at [GitHub](https://github.com/jau123/MeiGen-AI-Design-MCP). No code is obfuscated or minified beyond standard TypeScript compilation.

**Reference images**: The `upload_reference_image` tool compresses a user-specified image (max 2MB, 2048px) for use as a style reference in generation. This is always user-initiated and requires explicit invocation — no files are accessed automatically. The compressed image is sent only to the user's configured image generation provider, the same way any image generation API accepts input images.

**API tokens**: `MEIGEN_API_TOKEN` is stored locally in environment variables or `~/.config/meigen/config.json` with `chmod 600` permissions. Tokens are only sent to the configured provider's API endpoint and never logged or transmitted elsewhere.

**No telemetry**: The MCP server does not collect analytics, usage data, or send any information to third parties beyond the configured image generation provider.

## Troubleshooting

**"No image generation providers configured"**
→ Set `MEIGEN_API_TOKEN` or configure an alternative provider in `~/.config/meigen/config.json`

**Timeout during generation**
→ Image generation typically takes 10-30 seconds. During high demand, it may take longer. The server polls with a 5-minute timeout.

**ComfyUI connection refused**
→ Ensure ComfyUI is running and accessible at the configured URL. Test with: `curl <url>/system_stats`

**"Model not found"**
→ Run `list_models` to see available models for your configured providers.

**Reference image rejected**
→ Reference images require accessible URLs. Use `upload_reference_image` to prepare local files first.
