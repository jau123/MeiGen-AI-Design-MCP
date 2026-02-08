<h1 align="center">
  MeiGen-Art — Visual Engine for Claude Code & MCP Hosts
</h1>

<p align="center">
  <strong>The MCP plugin that turns your AI assistant into a local creative studio.<br>Search prompts, generate images, iterate — all through natural conversation.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/meigen"><img src="https://img.shields.io/npm/v/meigen?style=flat-square&color=blue" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/meigen"><img src="https://img.shields.io/npm/dm/meigen?style=flat-square&color=green" alt="npm downloads"></a>
  <img src="https://img.shields.io/badge/Type-MCP_Server-blue?style=flat-square" alt="MCP Server">
  <img src="https://img.shields.io/badge/Local-ComfyUI-green?style=flat-square" alt="ComfyUI Support">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square" alt="MIT"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#see-it-in-action">Demo</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#providers">Providers</a> &bull;
  <a href="#slash-commands">Commands</a>
</p>

<p align="center">
  <strong>English</strong> | <a href="README.zh-CN.md">中文</a>
</p>

---

## What Is This?

MeiGen-Art is an open-source **MCP Server** (plugin) that bridges your AI assistant and professional image generation tools. Think of it as installing a "graphics card driver" for Claude Code — once added, your AI can search visual references, enhance prompts, and generate images directly in the terminal.

**No API key required for free features** — inspiration search, prompt enhancement, and model browsing work out of the box.

### Why Install This Plugin?

<table>
<tr>
<td width="25%" align="center"><strong>Local GPU Generation</strong><br><sub>Connect your ComfyUI to generate on your own hardware — free, private, fully controlled</sub></td>
<td width="25%" align="center"><strong>1,300+ Prompt Library</strong><br><sub>Search curated trending prompts like a local Lovart — find references before you generate</sub></td>
<td width="25%" align="center"><strong>Multi-Direction Output</strong><br><sub>AI autonomously produces multiple creative directions in parallel — you just pick</sub></td>
<td width="25%" align="center"><strong>Cloud Fallback</strong><br><sub>No GPU? Use MeiGen Cloud or your own OpenAI key as a seamless backup</sub></td>
</tr>
</table>

---

## See It in Action

<p align="center">
  <a href="https://qiaowenlong-1317904822.cos.accelerate.myqcloud.com/github/git.mp4">
    <img src="assets/demo-thumbnail.jpg" alt="Watch Demo" width="600">
  </a>
  <br>
  <sub>▶ Watch: Generate professional images with natural language in Claude Code</sub>
</p>

### Logo Design — Multiple Directions + Iteration

```
You:  Design a logo for my coffee brand "Dawn Brew"

AI:   Here are 4 creative directions:
      ┌─────────────────────────────────────────────────────┐
      │  Which direction(s) do you want to try?             │
      │  ☐ 1. Modern Minimal — clean geometry, negative     │
      │  ☐ 2. Vintage Badge — retro emblem, craft feel      │
      │  ☐ 3. Hand-drawn — organic lines, artisan warmth    │
      │  ☐ 4. All of the above                              │
      └─────────────────────────────────────────────────────┘

You:  [selects 1 and 3]

AI:   Generating 2 images in parallel...
      ✓ Direction 1: Modern Minimal
        Image URL: https://images.meigen.art/xxx1.png
        Saved to: ~/Pictures/meigen/2026-02-08_dawn-brew-minimal.png
      ✓ Direction 3: Hand-drawn
        Image URL: https://images.meigen.art/xxx2.png
        Saved to: ~/Pictures/meigen/2026-02-08_dawn-brew-handdrawn.png

You:  I like Direction 1. Put it on a mug and a t-shirt.

AI:   Using Direction 1 as reference, generating 2 mockups in parallel...
      ✓ Mug mockup saved to: ~/Pictures/meigen/2026-02-08_dawn-brew-mug.png
      ✓ T-shirt mockup saved to: ~/Pictures/meigen/2026-02-08_dawn-brew-tshirt.png
```

### Product Photo — Brief Description to Pro Image

```
You:  Product photo for a perfume bottle

AI:   Your description is brief — enhancing with professional details...
      Added: studio rim lighting, white marble surface, soft bokeh background,
      35mm lens at f/2.8, warm amber tones, editorial composition

      ✓ Image URL: https://images.meigen.art/xxx3.png
        Saved to: ~/Pictures/meigen/2026-02-08_perfume.png
        (auto-opened in Preview)
```

### Inspiration Search to Reference Generation

```
You:  /meigen:find cyberpunk

AI:   Found 6 results:
      1. Neon-lit street scene — 12k views
      2. Cyberpunk portrait with visor — 8k views
      3. Futuristic cityscape at night — 15k views
      ...

You:  #3 looks cool, generate something similar but with a samurai

AI:   Using #3 as style reference...
      ✓ Image URL: https://images.meigen.art/xxx4.png
        Saved to: ~/Pictures/meigen/2026-02-08_cyberpunk-samurai.png
```

---

## Quick Start

### Claude Code Plugin (Recommended)

```bash
# Add the plugin marketplace
/plugin marketplace add jau123/MeiGen-Art

# Install
/plugin install meigen@meigen-marketplace
```

**Restart Claude Code** after installation (close and reopen, or open a new terminal tab).

#### First-Time Setup

Free features work immediately after restart — try:

> "Search for some creative inspiration"

To unlock image generation, run the setup wizard:

```
/meigen:setup
```

The wizard walks you through:
1. **Choose a provider** — local ComfyUI, MeiGen Cloud, or OpenAI-compatible API
2. **Enter credentials** — ComfyUI URL, API token, or key
3. **Done** — restart Claude Code once more, then start generating

### Other MCP-Compatible Hosts

Add to your MCP config (e.g. `.mcp.json`, `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "meigen": {
      "command": "npx",
      "args": ["-y", "meigen@latest"],
      "env": {
        "MEIGEN_API_TOKEN": "meigen_sk_..."
      }
    }
  }
}
```

> Free features (inspiration search, prompt enhancement, model listing) work without any API key.

---

<h2 id="features">Features</h2>

### MCP Tools

| Tool | Free | Description |
|------|------|-------------|
| `search_gallery` | Yes | Search 1,300+ curated trending prompts with visual previews |
| `get_inspiration` | Yes | Get full prompt, all images, and metadata for any gallery entry |
| `enhance_prompt` | Yes | Transform a brief idea into a professional image prompt |
| `list_models` | Yes | List available models across all configured providers |
| `upload_reference_image` | Yes | Compress and upload a local image for use as a reference |
| `comfyui_workflow` | Yes | Manage ComfyUI workflow templates: list, view, import, modify, delete |
| `generate_image` | Key | Generate an image — routes to the best available provider automatically |

### Slash Commands

| Command | Description |
|---------|-------------|
| `/meigen:gen <prompt>` | Quick generate — skip conversation, go straight to image |
| `/meigen:find <keywords>` | Search 1,300+ curated prompts for inspiration |
| `/meigen:models` | Browse and switch AI models for this session |
| `/meigen:ref <file>` | Upload a local image as reference, get a URL back |
| `/meigen:setup` | Interactive provider configuration wizard |

### Smart Agents

MeiGen uses specialized sub-agents for efficient parallel execution:

| Agent | Purpose |
|-------|---------|
| `image-generator` | Executes `generate_image` in isolated context — enables true parallel generation |
| `prompt-crafter` | Writes multiple distinct prompts for batch generation (runs on Haiku for cost efficiency) |
| `gallery-researcher` | Deep gallery exploration without cluttering the main conversation (runs on Haiku) |

### Output Styles

Switch creative modes with `/output-style`:

- **Creative Director** — Art direction mode with visual storytelling, mood boards, and design thinking
- **Minimal** — Just images and file paths, no commentary. Ideal for batch workflows

### Automation Hooks

- **Config Check** — Validates provider configuration on session start, guides setup if missing
- **Auto-Open** — Generated images automatically open in Preview (macOS)

---

<h2 id="providers">Providers</h2>

MeiGen-Art supports three image generation backends. Configure one or multiple — the system auto-selects the best available.

### ComfyUI — Local & Free

Run generation on your own GPU with full control over models, samplers, and workflow parameters. Import any ComfyUI API-format workflow — MeiGen auto-detects KSampler, CLIPTextEncode, EmptyLatentImage, and LoadImage nodes.

```json
{
  "comfyuiUrl": "http://localhost:8188",
  "comfyuiDefaultWorkflow": "txt2img"
}
```

> Perfect for Flux, SDXL, or any model you run locally. Your images never leave your machine.

### MeiGen Cloud

Cloud API with multiple models: Nanobanana Pro, GPT image 1.5, Seedream 4.5, and more. No GPU required.

**Get your API token:**
1. Sign in at [meigen.ai](https://www.meigen.ai)
2. Click your avatar → **Settings** → **API Keys**
3. Create a new key (starts with `meigen_sk_`)

```json
{ "meigenApiToken": "meigen_sk_..." }
```

### OpenAI-Compatible API

Bring your own API key for OpenAI (gpt-image-1.5), Together AI, Fireworks AI, or any compatible service.

```json
{
  "openaiApiKey": "sk-...",
  "openaiBaseUrl": "https://api.openai.com",
  "openaiModel": "gpt-image-1.5"
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
| `OPENAI_MODEL` | Default model (default: `gpt-image-1.5`) |
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
