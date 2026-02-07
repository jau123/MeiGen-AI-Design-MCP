<p align="center">
  <img src="assets/banner.jpg" alt="MeiGen-Art Banner" width="600">
</p>

<h1 align="center">
  MeiGen-Art — Visual Creative Expert
</h1>

<p align="center">
  <strong>Turn your AI assistant into a creative director for image generation</strong><br>
  <sub>MCP plugin for Claude Code, OpenClaw, and any MCP-compatible host</sub>
</p>

<p align="center">
  <a href="https://www.meigen.ai"><img src="https://img.shields.io/badge/Gallery-meigen.ai-blue?style=flat-square" alt="Gallery"></a>
  <a href="#tools"><img src="https://img.shields.io/badge/Tools-7-green?style=flat-square" alt="7 Tools"></a>
  <a href="#providers"><img src="https://img.shields.io/badge/Providers-3-orange?style=flat-square" alt="3 Providers"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square" alt="MIT"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#what-can-it-do">What Can It Do</a> •
  <a href="#providers">Providers</a> •
  <a href="#configuration">Configuration</a>
</p>

<p align="center">
  <strong>English</strong> | <a href="README.zh-CN.md">中文</a>
</p>

---

## Why MeiGen-Art?

Most AI image tools are either simple prompt-in-image-out APIs, or complex UIs that require expertise.

MeiGen-Art takes a different approach: it gives your AI assistant **professional creative knowledge** — 1,300+ curated trending prompts, style-specific enhancement techniques, and multi-step workflow orchestration — so you can describe what you want in plain language, and get production-quality results.

**No prompt engineering skills needed.** Just talk to your AI assistant like you would to a creative director.

---

## Installation

### Claude Code

```bash
# Add the plugin source
/plugin marketplace add jau123/MeiGen-Art

# Install
/plugin install meigen@meigen-marketplace
```

Then run the setup wizard to configure your image generation provider:

```
/meigen:setup
```

### OpenClaw

Our skills follow the [Agent Skills](https://agentskills.io) open standard, so they work directly in OpenClaw.

**Skills only** — copy the skills into your workspace:

```bash
cp -r skills/* ~/.openclaw/workspace/skills/
```

**Skills + MCP tools** — also add the MCP server via [MCP adapter](https://github.com/androidStern/openclaw-mcp-adapter):

```json
{
  "plugins": {
    "openclaw-mcp-adapter": {
      "servers": {
        "meigen": {
          "transport": "stdio",
          "command": "npx",
          "args": ["-y", "meigen"],
          "env": {
            "MEIGEN_API_TOKEN": "meigen_sk_..."
          }
        }
      }
    }
  }
}
```

### Other MCP-Compatible Hosts

Add to your `.mcp.json` or equivalent config:

```json
{
  "mcpServers": {
    "meigen": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "meigen"],
      "env": {
        "MEIGEN_API_TOKEN": "meigen_sk_..."
      }
    }
  }
}
```

> **Tip:** Even without an API key, free features (inspiration search, prompt enhancement, model listing) work immediately.

---

## What Can It Do

### 1. Explore & Get Inspired

> "Help me think of something for a social media post"

When you're not sure what to create, the assistant browses the curated gallery of 1,300+ trending prompts, shows you visual previews, and lets you pick a style before generating anything.

### 2. Simple Idea to Pro Image

> "A cat sitting in a Japanese garden"

Short descriptions get automatically enhanced into professional prompts with specific visual details — lighting, composition, lens, color palette — then generated. No prompt engineering knowledge needed.

### 3. Batch & Variant Generation

> "Design 4 different logo concepts for a coffee brand"

The assistant writes distinct creative directions for each variant, generates them in parallel (up to 4 at once), and presents the results with comparative commentary.

### 4. Multi-Step Creative Workflow

> "Create a logo, then show me how it looks on a mug and a t-shirt"

The assistant chains generation steps: creates the base image first, then uses it as a reference to generate product mockups — maintaining visual consistency across the series.

### 5. Reference Image Style Transfer

> "Use this local photo as a style reference for my new image"

Local images are automatically compressed and uploaded. The returned URL works as a reference across all three providers — for style transfer, composition guidance, or img2img workflows.

---

<h2 id="tools">Tools</h2>

| Tool | Free | Description |
|------|------|-------------|
| `search_gallery` | Yes | Search 1,300+ curated trending prompts with visual previews |
| `get_inspiration` | Yes | Get full prompt, all images, and metadata for any gallery entry |
| `enhance_prompt` | Yes | Transform a brief idea into a professional image prompt (runs locally) |
| `list_models` | Yes | List available models across all configured providers |
| `upload_reference_image` | Yes | Compress and upload a local image for use as a reference |
| `comfyui_workflow` | Yes | Manage ComfyUI workflow templates: list, view, import, modify, delete |
| `generate_image` | Key | Generate an image — routes to the best available provider automatically |

---

<h2 id="providers">Providers</h2>

MeiGen-Art supports three image generation backends. You can configure one or multiple — the assistant auto-selects the best available, or you can specify per-request.

### MeiGen Platform (Recommended)

Cloud API with multiple model options: NanoBanana Pro, Seedream 4.5, Midjourney Niji7, and more. Free daily credits included.

```json
{ "meigenApiToken": "meigen_sk_..." }
```

### ComfyUI (Local)

Run generation on your own GPU with full control over models, samplers, and workflow parameters. Import any ComfyUI API-format workflow.

```json
{
  "comfyuiUrl": "http://localhost:8188",
  "comfyuiDefaultWorkflow": "txt2img"
}
```

### OpenAI-Compatible API

Bring your own API key for OpenAI (gpt-image-1), Together AI, Fireworks AI, or any OpenAI-compatible service.

```json
{
  "openaiApiKey": "sk-...",
  "openaiBaseUrl": "https://api.openai.com",
  "openaiModel": "gpt-image-1"
}
```

> All three providers support **reference images**. MeiGen and OpenAI accept URLs directly; ComfyUI injects them into LoadImage nodes in your workflow.

---

## Configuration

### Interactive Setup (Recommended)

```
/meigen:setup
```

The wizard walks you through provider selection, API key entry, and ComfyUI workflow import. You can also paste a `curl` command from your API provider's docs — it auto-extracts the key, URL, and model.

### Config File

Configuration is stored at `~/.config/meigen/config.json`. ComfyUI workflows are stored at `~/.config/meigen/workflows/`.

### Environment Variables

Environment variables take priority over the config file.

| Variable | Description |
|----------|-------------|
| `MEIGEN_API_TOKEN` | MeiGen platform token |
| `OPENAI_API_KEY` | OpenAI / compatible API key |
| `OPENAI_BASE_URL` | API base URL (default: `https://api.openai.com`) |
| `OPENAI_MODEL` | Default model (default: `gpt-image-1`) |
| `COMFYUI_URL` | ComfyUI server URL (default: `http://localhost:8188`) |

---

## Development

```bash
npm install        # Install dependencies
npm run build      # Compile TypeScript → dist/
npm run dev        # Development mode (tsx)
npm run typecheck  # Type check without emitting
```

---

## License

MIT
