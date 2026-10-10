# MeiGen for OpenClaw

Find inspiration, create images and videos with the latest AI models, and continue from your MeiGen favorites, boards and past creations.

## Install and connect

Use a current OpenClaw release with native HTTP MCP and OAuth support (validated with 2026.9.9). Install from [ClawHub](https://clawhub.ai/plugins/meigen-ai-design):

```bash
openclaw plugins install clawhub:meigen-ai-design
```

For a **new connection**, save the server before signing in:

```bash
openclaw mcp add meigen --url https://www.meigen.ai/api/mcp --transport streamable-http --auth oauth --timeout 240
openclaw mcp login meigen
```

Complete MeiGen sign-in and approve the permissions yourself in the browser. Never send a key or token in chat. The bundle supplies the remote server; OpenClaw's login command also needs the same server saved in `mcp.servers`. The saved entry takes precedence, so this does not create a second set of tools.

If `meigen` already exists, `mcp add` stops without overwriting it. Inspect the existing connection privately. Reuse a matching remote OAuth entry and run `mcp login meigen`. Do not use `mcp set` blindly: it replaces the entry. See migration below for local connections.

```bash
openclaw mcp doctor meigen --probe
```

Start a new conversation and ask: **“Use MeiGen to list available Skills and current prices. Only query; do not generate or spend credits.”** A successful tool call verifies access. Plugin installation alone does not prove sign-in or private-library access.

## Included

- Remote MCP tools for inspiration, images, videos and five image workflows.
- OAuth-only favorites, boards, generation history, prompt retrieval and saving favorites. Approve the additional library permissions when requested.
- Creative guides for visual work, product photos and social thumbnails.

Generation uses purchased credits, not daily free credits. Saving requires your request or prior opt-in; liking an output alone does not authorize a save. Reference uploads receive publicly accessible links. Check current tool schemas and prices before paid work. Search/account limits and library permissions still apply.

## Upgrading from the 3.x ClawHub plugin

**4.0 changes the default from local npm/stdio to remote OAuth.** The ClawHub package stays `meigen-ai-design`; the installed bundle ID stays `meigen`. No npm update is required. The Claude marketplace plugin is a separate distribution.

Before updating, back up your OpenClaw configuration. A saved `mcp.servers.meigen` entry overrides the bundle default and is never migrated by this package. If it uses stdio, an API key, a wrapper or BYOK, choose whether to keep it. Retaining that configuration keeps local-only capabilities but cannot enable the private library. To switch, preserve the old entry and credentials in your private backup, deliberately remove the old active entry, then use the new-connection commands above. Keep one active MeiGen connection. Do not silently replace an OpenAI-compatible provider with paid MeiGen generation.

Remote MCP returns URLs and cannot directly read local files. Use an accessible reference URL or supported attachment upload. Local prompt enhancement, local preferences, BYOK and automatic local-file handling remain in [legacy npm](https://github.com/jau123/MeiGen-AI-Design-MCP/blob/main/SETUP.md), not this remote connection.

The standalone [creative-toolkit Skill](https://clawhub.ai/jau123/skills/creative-toolkit) contains instructions only. It is optional for an existing connection; do not install both copies of the same guidance. This package is a supported content/MCP bundle, not a JavaScript runtime plugin; it makes no claim to execute Claude hooks.

[Connection guide](https://docs.meigen.ai/en/mcp/remote#openclaw) · [Manage access](https://www.meigen.ai/oauth/connections)
