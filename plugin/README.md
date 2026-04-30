# MeiGen AI Design — Claude Code Plugin

AI image generation plugin with creative workflow orchestration, parallel multi-direction output, prompt engineering, and a 1,300+ curated inspiration library.

## Prerequisites

This plugin requires the `meigen` MCP server. Add it to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "meigen": {
      "command": "npx",
      "args": ["-y", "meigen@1.2.13"]
    }
  }
}
```

Restart Claude Code after adding the configuration.

## Provider Setup

The plugin supports three image generation backends. Configure at least one to generate images. **Free features** (gallery search, prompt enhancement, model listing, preferences) work without any provider.

### MeiGen Cloud (Recommended)

1. Sign up at [meigen.ai](https://www.meigen.ai)
2. Go to Settings → API Keys → create a new key (starts with `meigen_sk_`)
3. Set the environment variable:

```bash
export MEIGEN_API_TOKEN=meigen_sk_your_token_here
```

### Local ComfyUI

1. Install and start [ComfyUI](https://github.com/comfyanonymous/ComfyUI)
2. Set the server URL:

```bash
export COMFYUI_URL=http://localhost:8188
```

3. Export workflows from ComfyUI (API format JSON) and import via the plugin

### OpenAI-compatible API

Works with any OpenAI-compatible image API (OpenAI, Together AI, Fireworks AI, etc.):

```bash
export OPENAI_API_KEY=your_key_here
export OPENAI_BASE_URL=https://api.openai.com/v1   # or your provider's URL
export OPENAI_MODEL=gpt-image-1                      # or your provider's model
```

## Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| `gallery-researcher` | haiku | Search gallery, find references, build mood boards |
| `prompt-crafter` | haiku | Write multiple distinct prompts for parallel generation |
| `image-generator` | inherit | Execute `generate_image` calls, relay results |

## Commands

| Command | Description |
|---------|-------------|
| `/meigen:gen <prompt>` | Quick image generation — skips intent assessment |
| `/meigen:find <keywords>` | Quick gallery search — browse inspiration |
| `/meigen:models` | List available models and switch default |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| MCP tools not available | Restart Claude Code after adding `.mcp.json` config |
| No providers configured | Free features still work; run `/meigen:setup` to configure a provider |
| API key errors | Check `~/.config/meigen/config.json` or environment variables |
| ComfyUI connection refused | Ensure ComfyUI is running at the configured URL |
| Generation timeout | High demand — try again in a moment |
| Empty search results | Try different keywords or browse by category |

## License

MIT
