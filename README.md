<h1 align="center">MeiGen AI Design MCP</h1>


<p align="center">
  Discover inspiration. Create images and videos with the latest AI models.<br>
  Open-source MCP tools for ChatGPT, Claude, Cursor, OpenClaw and other AI assistants.
</p>

<p align="center">
  <a href="https://chatgpt.com/plugins/plugin_asdk_app_6ab66d24f56481919361b6c33f7c1928"><img src="https://img.shields.io/badge/ChatGPT-111111?style=for-the-badge" alt="Install for ChatGPT"></a>
  <a href="#remote-mcp"><img src="https://img.shields.io/badge/Claude-111111?style=for-the-badge" alt="Connect Claude"></a>
  <a href="#remote-mcp"><img src="https://img.shields.io/badge/Cursor-111111?style=for-the-badge" alt="Connect Cursor"></a>
  <a href="#openclaw"><img src="https://img.shields.io/badge/OpenClaw-111111?style=for-the-badge" alt="Connect OpenClaw"></a>
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
| **ChatGPT** | [Install from the official ChatGPT store](https://chatgpt.com/plugins/plugin_asdk_app_6ab66d24f56481919361b6c33f7c1928) → sign in to MeiGen → start a new chat and use MeiGen. No API key needed. |
| **Claude** | [Connect remote MCP](#remote-mcp) and sign in to MeiGen. Optional [creative helpers](#claude-code) are available separately. |
| **Cursor** | [Add the remote MCP URL](#remote-mcp), then sign in. |
| **OpenClaw** | [Install from ClawHub](#openclaw), then sign in with OAuth. |
| **Other MCP clients** | [Connect remote MCP](#remote-mcp) with OAuth. [Setup guide →](SETUP.md) |

Try a search first:

> Use MeiGen to find minimalist product photography inspiration. Show me the reference images and prompts.

Want more options? With remote MCP, ask for another batch of the same search, or describe a new direction.

Search and model/Skill lookups do not spend generation credits. MeiGen Cloud generation uses **purchased credits** from your account; daily free credits do not apply. Check current prices and confirm the scope before generating.

<a id="features"></a>
<a id="skills"></a>

## What you can do

| Capability | Try asking |
|---|---|
| Inspiration search | “Find cinematic portrait references and show their prompts.” |
| Image & video generation | “Create one product photo, then animate it into a short video.” |
| Reference media | “Use this clip or audio as a reference with a compatible video model.” |
| Saved characters — remote OAuth | “List my MeiGen characters and use this one in the video.” |
| Personal library — remote OAuth | “Find my saved references, or the prompt from a previous creation.” |
| Background removal | “Remove this background and give me a transparent PNG.” |
| Product Detail Images | “Make a hero shot, a close-up and a lifestyle image for this product.” |
| Marketing Poster | “Design one poster for our weekend coffee tasting.” |
| AI Backgrounds | “Place this product on a sunlit stone counter.” |
| Upscale | “Enhance this original photo while preserving its appearance.” |

Provide a source image when the task needs one. Your assistant checks available models, options and prices with `list_models` / `list_skills`, prepares inputs, and returns results. See the [Skill API guide](SKILLS_API.md) for input limits and tool-call examples.

Video references follow each model’s supported frame, content-image, video and audio inputs. Media preparation does not spend generation credits, requires a positive purchased balance, and creates temporary public URLs cleared after seven days. Saved characters can be read and reused through OAuth; creating characters is not supported. See [3.1 release notes](RELEASE_NOTES_3.1.0.md).

### Bring your MeiGen library into the conversation

Browse and save ideas in MeiGen, then continue with your assistant. With [remote OAuth](#remote-mcp), it can search your favorites, browse boards, find past creations and read a selected original prompt. For questions about your preferred style, it can use relevant favorites as references.

Ask to save a selected inspiration or your own result, optionally to a private board. Saving requires your request or prior permission, does not publish the work, and does not spend generation credits. Reading and saving use separate account permissions; existing connections may need additional consent.

**Available through remote OAuth and the official ChatGPT plugin.** Local npm and API keys cannot access the private library. Refresh your client’s tool list and complete any requested additional consent. See the [account-library reference](RELEASE_NOTES_3.0.0.md#remote-account-library) for tool names and prompt pagination.

<a id="other-clients"></a>

## Manual MCP setup

Use remote OAuth for a new MeiGen connection. Keep one connection per client to avoid duplicate tools. Local npm and the optional client plugins below support existing API-key integrations and OpenAI-compatible image providers.

<a id="remote-mcp"></a>

### Remote MCP

Add this **Streamable HTTP** URL in your client's MCP settings, then choose **Connect / Authenticate** and sign in to MeiGen:

```text
https://www.meigen.ai/api/mcp
```

OAuth requires support in your client. If unavailable, use a compatible host or the official ChatGPT plugin; a new API key is not a substitute for account sign-in. Reconnect and ask “List MeiGen's available Skills and current prices” to verify the connection without generating.

For optional Codex CLI / IDE MCP configuration, see the [advanced setup guide](SETUP.md#codex-manual).

### Local npm — legacy compatibility and BYOK

Existing local integrations and BYOK workflows can keep this stdio configuration. New MeiGen users should use remote OAuth above. Node.js 22+ is recommended:

```json
{
  "mcpServers": {
    "meigen": {
      "command": "npx",
      "args": ["-y", "meigen@3.3.2"]
    }
  }
}
```

Existing local API keys remain compatible with generation, public search and Skills as `MEIGEN_API_TOKEN` in the server's private environment, but cannot access the private library. New connections use remote OAuth. OpenAI-compatible providers support general image generation; video and the five visual Skills use MeiGen Cloud. See [client-specific setup, providers and CLI](SETUP.md).

**Upgrading from 2.x?** [3.0.0 is available on npm](https://www.npmjs.com/package/meigen/v/3.0.0). It removes ComfyUI and the bundled offline prompt library. Read the [migration notes](RELEASE_NOTES_3.0.0.md) and preserve your existing credentials and settings when updating.

<a id="claude-code"></a>

<details>
<summary><strong>Claude plugin</strong></summary>

For new connections, use [remote OAuth](#remote-mcp). The optional plugin below retains its bundled legacy stdio connection; keep one active MeiGen connection per host when switching. To install only within that supported setup, run inside Claude, then restart:

```text
/plugin marketplace add jau123/MeiGen-AI-Design-MCP
/plugin install meigen@meigen-marketplace
```

Use `/meigen:setup` for connection guidance or existing legacy/BYOK configuration. The plugin adds `/meigen:gen`, `/meigen:find`, `/meigen:models` and optional creative agents. [Plugin guide →](plugin/README.md)

</details>

<a id="openclaw"></a>

<details>
<summary><strong>OpenClaw</strong></summary>

Install [MeiGen from ClawHub](https://clawhub.ai/plugins/meigen-ai-design) in current OpenClaw, then connect your account with OAuth:

```bash
openclaw plugins install clawhub:meigen-ai-design
# New connection only; preserve any existing meigen entry
openclaw mcp add meigen --url https://www.meigen.ai/api/mcp --transport streamable-http --auth oauth --timeout 240
openclaw mcp login meigen
```

The 4.1 plugin includes creative guides and remote tools, including OAuth-only favorites, boards and history. The standalone `creative-toolkit` Skill is instructions only and is not needed alongside the plugin. [Setup and migration from local 3.x →](SETUP.md#openclaw)

</details>

<a id="install-with-ai"></a>

<details>
<summary><strong>Let your coding assistant set up MCP</strong></summary>

Paste this into an assistant that can configure your MCP client:

```text
Set up MeiGen MCP using https://github.com/jau123/MeiGen-AI-Design-MCP#quick-start.
Detect this client, preserve other servers and reuse any existing MeiGen entry.
Use remote HTTP with OAuth for MeiGen account access. Keep existing legacy API-key or BYOK connections only when they are needed; do not create a new MeiGen key.
Let me sign in through the host, never send credentials in chat.
Reconnect and verify with list_skills. Do not upload, generate or spend credits.
If you cannot configure this client, explain the remaining manual steps.
```

</details>

<a id="upgrading"></a>

## Documentation

- [Client setup, configuration, privacy and troubleshooting](SETUP.md) · [Upgrading](SETUP.md#upgrading)
- [Five Skills HTTP API and MCP examples](SKILLS_API.md)
- [Compose image/video steps and recover interrupted jobs](COMPOSABLE_WORKFLOWS.md)
- [Claude plugin commands and agents](plugin/README.md)
- [3.0 migration notes](RELEASE_NOTES_3.0.0.md) · [Maintainer release guide](RELEASING.md)

If a generation is interrupted, check the original task with `check_generation` or `check_skill` before starting another paid request. Keep your original assets and download results you need to retain.

## Community & license

[Discord](https://discord.gg/uX6rnersUx) · [Issues](https://github.com/jau123/MeiGen-AI-Design-MCP/issues) · [MeiGen](https://www.meigen.ai) · [Privacy policy](https://www.meigen.ai/privacy-policy)

Featured in [Awesome MCP Servers](https://github.com/punkpeye/awesome-mcp-servers) and [wshobson/agents](https://github.com/wshobson/agents/tree/main/plugins/meigen-ai-design).

[MIT](LICENSE). The open-source server is free to use; cloud generation and third-party providers have their own usage costs.
