# MeiGen for OpenClaw

Find visual inspiration, create images and videos, and continue from your MeiGen favorites, boards and characters.

## Install and connect

```bash
openclaw plugins install clawhub:meigen-ai-design
```

Use OpenClaw's MCP connection settings to sign in to MeiGen through browser OAuth. Reuse an existing remote connection. Installation alone does not prove account access.

Start with: **“Use MeiGen to find product photography inspiration.”** For a connection check, ask to list available models and Skills without generating or uploading.

<details>
<summary>Manual connection or migration</summary>

For a new saved connection on an OpenClaw version supporting HTTP MCP and OAuth:

```bash
openclaw mcp add meigen --url https://www.meigen.ai/api/mcp --transport streamable-http --auth oauth --timeout 240
openclaw mcp login meigen
openclaw mcp doctor meigen --probe
```

Login needs a saved MCP entry; the saved entry overrides the matching bundle default. If `meigen` already exists, inspect and reuse it instead of overwriting it. Preserve old stdio, API-key and BYOK settings privately until you choose to migrate. Keep one active connection. Never paste credentials into chat.

[Migration guide](https://github.com/jau123/MeiGen-AI-Design-MCP/blob/main/MIGRATION.md)

</details>

## What is included

- A remote MCP connection to `https://www.meigen.ai/api/mcp`.
- One short guide for using the installed tools, with connection and recovery help.

The service supplies current tools, models, prices and result pages. This package has no local generation engine, creative agents or custom commands. Generation uses purchased credits only, not daily free credits. Private-library operations request their own OAuth permissions. Uploads can create public links; share only intended references. Interactive pages and downloads depend on the host.

The existing `creative-toolkit` Skill uses the same guide. Do not install both. Its users can keep a working remote connection; new users should choose this plugin.

Plugin 4.3.0 simplifies the previous four-guide bundle. The package name `meigen-ai-design`, runtime ID `meigen`, endpoint and OAuth connection are unchanged. The dedicated Claude plugin is retired; the compatibility manifest here is only an OpenClaw bundle-format marker.

[Connection guide](https://docs.meigen.ai/en/mcp/remote#openclaw) · [Manage access](https://www.meigen.ai/oauth/connections)
