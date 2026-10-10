<h1 align="center">MeiGen AI Design MCP</h1>

<p align="center">
  Open-source visual tools for your AI assistant: inspiration, images, videos and product visuals.<br>
  Works with ChatGPT (including Codex), Claude Code, Cursor, OpenClaw and other MCP clients.
</p>

<p align="center">
  <a href="https://chatgpt.com/plugins/plugin_asdk_app_6ab66d24f56481919361b6c33f7c1928"><img src="https://img.shields.io/badge/ChatGPT_%26_Codex-111111?style=for-the-badge" alt="Install for ChatGPT and Codex"></a>
  <a href="#claude-code"><img src="https://img.shields.io/badge/Claude_Code-111111?style=for-the-badge" alt="Install for Claude Code"></a>
  <a href="#remote-mcp"><img src="https://img.shields.io/badge/Cursor-111111?style=for-the-badge" alt="Connect Cursor"></a>
  <a href="#openclaw"><img src="https://img.shields.io/badge/OpenClaw-111111?style=for-the-badge" alt="Install for OpenClaw"></a>
  <a href="#other-clients"><img src="https://img.shields.io/badge/Other_MCP-111111?style=for-the-badge" alt="Connect other MCP clients"></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/meigen"><img src="https://img.shields.io/npm/v/meigen?style=flat-square&color=blue" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square" alt="MIT"></a>
  <a href="https://discord.gg/uX6rnersUx"><img src="https://img.shields.io/badge/Discord-Join-5865F2?style=flat-square&logo=discord&logoColor=white" alt="Discord"></a>
</p>

<p align="center">
  <strong>English</strong> · <a href="README.zh-CN.md">中文</a><br>
  <a href="#quick-start">Quick start</a> · <a href="#skills">Capabilities</a> · <a href="#other-clients">Manual setup</a> · <a href="#documentation">Documentation</a>
</p>

## Quick start

<a id="chatgpt-web"></a>
<a id="codex"></a>

Choose the AI tool you use:

| Client | Get started |
|---|---|
| **ChatGPT / Codex** | [Install from the official ChatGPT store](https://chatgpt.com/plugins/plugin_asdk_app_6ab66d24f56481919361b6c33f7c1928) → sign in to MeiGen → start a new chat and use MeiGen. No API key needed. |
| **Claude Code** | [Install the plugin](#claude-code) for commands and creative helpers, or [connect remote MCP](#remote-mcp). |
| **Cursor** | [Add the remote MCP URL](#remote-mcp), then sign in. |
| **OpenClaw** | [Install the ClawHub plugin](#openclaw). |
| **Other MCP clients / CLI** | Use [remote MCP](#remote-mcp) or [local npm](#local-npm). [VS Code, Windsurf, Roo Code and Hermes setup →](SETUP.md) |

Try a search first:

> Use MeiGen to find minimalist product photography inspiration. Show me the reference images and prompts.

Search and model/Skill lookups do not spend generation credits. MeiGen Cloud generation uses **purchased credits** from your account; daily free credits do not apply. Check current prices and confirm the scope before generating.

<a id="features"></a>
<a id="skills"></a>

## What you can do

| Capability | Try asking |
|---|---|
| Inspiration search | “Find cinematic portrait references and show their prompts.” |
| Image & video generation | “Create one product photo, then animate it into a short video.” |
| Background removal | “Remove this background and give me a transparent PNG.” |
| Product Detail Images | “Make a hero shot, a close-up and a lifestyle image for this product.” |
| Marketing Poster | “Design one poster for our weekend coffee tasting.” |
| AI Backgrounds | “Place this product on a sunlit stone counter.” |
| Upscale | “Enhance this original photo while preserving its appearance.” |

Provide a source image when the task needs one. Your assistant checks available models, options and prices with `list_models` / `list_skills`, prepares inputs, and returns results. See the [Skill API guide](SKILLS_API.md) for input limits and tool-call examples.

### One product, four directions

<p align="center">
  <img src="assets/sample-luxury.jpg" alt="Luxury still life" width="24%">
  <img src="assets/sample-model.jpg" alt="Model campaign" width="24%">
  <img src="assets/sample-botanicals.jpg" alt="Botanical product scene" width="24%">
  <img src="assets/sample-minimal.jpg" alt="Minimalist product photo" width="24%">
</p>

[Watch the demo on YouTube](https://youtu.be/JQ3DZ1DXqvs).

<a id="other-clients"></a>

## Manual MCP setup

| Connection | Best for |
|---|---|
| **Remote MCP** | MeiGen Cloud in Claude Code, Cursor and compatible HTTP clients. No local install. |
| **Local npm** | Local file preparation/saving, ComfyUI, OpenAI-compatible image APIs and CLI use. |
| **Client plugins** | Claude Code or OpenClaw with bundled setup and creative helpers. |

Keep one MeiGen connection per client to avoid duplicate tools. All five visual Skills and video generation use MeiGen Cloud; ComfyUI and OpenAI-compatible providers support local general image generation.

<a id="remote-mcp"></a>

### Remote MCP

Add this **Streamable HTTP** URL in your client's MCP settings, then choose **Connect / Authenticate** and sign in to MeiGen:

```text
https://www.meigen.ai/api/mcp
```

OAuth requires support in your client. If unavailable, use the [private API-key setup](SETUP.md#authentication). Reconnect and ask “List MeiGen's available Skills and current prices” to verify the connection without generating.

For optional Codex CLI / IDE MCP configuration, see the [advanced setup guide](SETUP.md#codex-manual).

### Local npm

Node.js 22+ is recommended. Add this entry to your client's MCP configuration:

```json
{
  "mcpServers": {
    "meigen": {
      "command": "npx",
      "args": ["-y", "meigen@2.0.2"]
    }
  }
}
```

For MeiGen Cloud generation, create a private key at [API Keys](https://www.meigen.ai/profile/api-keys) and pass it as `MEIGEN_API_TOKEN` in the server's launch environment. Keep it out of chat and source control. See [client-specific setup, providers and CLI](SETUP.md).

<a id="claude-code"></a>

<details>
<summary><strong>Claude Code plugin</strong></summary>

Run inside Claude Code, then restart:

```text
/plugin marketplace add jau123/MeiGen-AI-Design-MCP
/plugin install meigen@meigen-marketplace
```

Use `/meigen:setup` to configure a provider. The plugin adds `/meigen:gen`, `/meigen:find`, `/meigen:models` and optional creative agents. [Plugin guide →](plugin/README.md)

</details>

<a id="openclaw"></a>

<details>
<summary><strong>OpenClaw</strong></summary>

Install the [full plugin from ClawHub](https://clawhub.ai/plugins/meigen-ai-design):

```bash
openclaw plugins install clawhub:meigen-ai-design
```

For the standalone Skill instead: `npx clawhub@latest install creative-toolkit`. [Setup and troubleshooting →](SETUP.md)

</details>

<a id="install-with-ai"></a>

<details>
<summary><strong>Let your coding assistant set up MCP</strong></summary>

Paste this into an assistant that can configure your MCP client:

```text
Set up MeiGen MCP using https://github.com/jau123/MeiGen-AI-Design-MCP#quick-start.
Detect this client, preserve other servers and reuse any existing MeiGen entry.
Prefer remote HTTP with OAuth; use local npm if I need local files or ComfyUI.
Let me sign in or enter credentials privately, never in chat.
Reconnect and verify with list_skills. Do not upload, generate or spend credits.
If you cannot configure this client, explain the remaining manual steps.
```

</details>

<a id="upgrading"></a>

## Documentation

- [Client setup, configuration, privacy and troubleshooting](SETUP.md) · [Upgrading](SETUP.md#upgrading)
- [Five Skills HTTP API and MCP examples](SKILLS_API.md)
- [Compose image/video steps and recover interrupted jobs](COMPOSABLE_WORKFLOWS.md)
- [Claude Code plugin commands and agents](plugin/README.md)
- [Release notes](RELEASE_NOTES_2.0.2.md) · [Maintainer release guide](RELEASING.md)

If a generation is interrupted, check the original task with `check_generation` or `check_skill` before starting another paid request. Keep your original assets and download results you need to retain.

## Community & license

[Discord](https://discord.gg/uX6rnersUx) · [Issues](https://github.com/jau123/MeiGen-AI-Design-MCP/issues) · [MeiGen](https://www.meigen.ai) · [Privacy policy](https://www.meigen.ai/privacy-policy)

The local prompt library includes 1,446 curated prompts from [nanobanana-trending-prompts](https://github.com/jau123/nanobanana-trending-prompts). Featured in [Awesome MCP Servers](https://github.com/punkpeye/awesome-mcp-servers) and [wshobson/agents](https://github.com/wshobson/agents/tree/main/plugins/meigen-ai-design).

[MIT](LICENSE). The open-source server is free to use; cloud generation and third-party providers have their own usage costs.
