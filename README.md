<h1 align="center">MeiGen AI Design MCP</h1>

> 3.0.0 is prepared in this source checkout and has not been published by this change. Installation pins target the upcoming major release; verify registry availability before upgrading. Read the [3.0 migration notes](RELEASE_NOTES_3.0.0.md) for removed ComfyUI/offline-library support and the remote OAuth account library.

<p align="center">
  Open-source visual tools for your AI assistant: inspiration, images, videos and product visuals.<br>
  Works with ChatGPT, Claude, Cursor, OpenClaw and other MCP clients.
</p>

<p align="center">
  <a href="https://chatgpt.com/plugins/plugin_asdk_app_6ab66d24f56481919361b6c33f7c1928"><img src="https://img.shields.io/badge/ChatGPT-111111?style=for-the-badge" alt="Install for ChatGPT"></a>
  <a href="#claude-code"><img src="https://img.shields.io/badge/Claude-111111?style=for-the-badge" alt="Install for Claude"></a>
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
| **ChatGPT** | [Install from the official ChatGPT store](https://chatgpt.com/plugins/plugin_asdk_app_6ab66d24f56481919361b6c33f7c1928) → sign in to MeiGen → start a new chat and use MeiGen. No API key needed. |
| **Claude** | [Connect remote MCP](#remote-mcp) and sign in to MeiGen. Optional [creative helpers](#claude-code) are available separately. |
| **Cursor** | [Add the remote MCP URL](#remote-mcp), then sign in. |
| **OpenClaw** | [Connect remote MCP](#remote-mcp) with an OAuth-capable host; optional [ClawHub instructions](#openclaw). |
| **Other MCP clients** | [Connect remote MCP](#remote-mcp) with OAuth. [Setup guide →](SETUP.md) |

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
| **Remote OAuth MCP — recommended** | MeiGen account sign-in for creation, favorites, boards and history. No local install. |
| **Local npm — legacy compatibility / BYOK** | Existing API keys for generation, public search and Skills; local file preparation/saving and OpenAI-compatible image APIs. No private library. |
| **Client plugins** | Optional creative helpers; current bundled MCP configuration remains legacy stdio. |

Keep one MeiGen connection per client to avoid duplicate tools. All five visual Skills and video generation use MeiGen Cloud; OpenAI-compatible providers support local general image generation.

### Account library through remote OAuth (next backend release)

With remote MeiGen OAuth account sign-in, `search_favorites` finds saved inspiration, `list_boards` finds project boards, and `search_history` finds earlier creations with prompt excerpts. Use `get_library_item` to read a selected original user prompt. `save_favorite` saves an existing gallery item or authorized generation, optionally to an owned private board, with the user's stated reason. Repeated saves do not remove the item or overwrite an existing note.

For requests about your taste or preferred style, the assistant can consult relevant favorites instead of guessing. Saving needs an explicit request or prior opt-in; liking a result alone does not automatically save it. These tools do not spend generation credits. Only the remote OAuth connection exposes these tools. Local npm, legacy MeiGen API keys and OpenAI-compatible provider keys cannot access the private library.

“Show another batch” keeps the same gallery query and uses the returned snapshot and next offset. A new creative direction starts a new search. Results no longer come from a bundled offline library.

For the 3.0.0 npm `search_gallery` tool, the combined query and optional category must fit within 200 UTF-16 code units. `limit` accepts integers from 1–20 (default 3), with at most 3 results returned; `offset` accepts integers from 0–100000. Fractional values are rejected. Use the returned `nextOffset`, not a guessed page number.

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
      "args": ["-y", "meigen@3.0.0"]
    }
  }
}
```

Existing local API keys remain compatible with generation, public search and Skills as `MEIGEN_API_TOKEN` in the server launch environment, but cannot access the private library. New connections use remote OAuth. Keep them private. This server has no OAuth login or personal-library tools; use the remote connection for those features. See [client-specific setup, providers and CLI](SETUP.md).

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

For new connections, use [remote OAuth](#remote-mcp). The [full plugin from ClawHub](https://clawhub.ai/plugins/meigen-ai-design) retains a bundled legacy stdio connection:

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

Account-library tools are available only through the remote OAuth connection at `https://www.meigen.ai/api/mcp`, after MeiGen sign-in and consent. API keys and local npm cannot access favorites, boards, history or item details. Lists return prompt excerpts; use the remote `get_library_item` tool to read a selected full prompt in Unicode code-point pages (default 8000, maximum 16000). `prompt.length` is the total safe prompt length; `nextOffset=null` marks the final part. Full data appears once in `structuredContent`; text is a short summary.
