# MeiGen MCP

[中文](README.zh-CN.md) · [Connect](SETUP.md) · [Migration](MIGRATION.md)

Find visual inspiration, create images and videos, and use your MeiGen favorites, boards, history and saved characters. Tools, model schemas and business logic run on MeiGen's hosted MCP server.

## Connect directly (recommended)

Add a **Streamable HTTP** MCP connection to:

```text
https://www.meigen.ai/api/mcp
```

Sign in using your host's OAuth flow. Claude Code, Cursor, VS Code and current OpenClaw support native remote connections. Use the host's MCP configuration UI; do not install a second connection if MeiGen is already present. New accounts do not need an API key.

Claude Code / Cursor configuration:

```json
{"mcpServers":{"meigen":{"type":"http","url":"https://www.meigen.ai/api/mcp"}}}
```

For VS Code, put the same entry under `servers` in `.vscode/mcp.json`. Verify with `list_models` and `list_skills`; these public calls do not prove private access. Personal library tools require OAuth and their requested permissions. Generation uses **purchased credits only**, never daily free credits.

## Final npm bridge

**4.0.0 is the prepared release candidate, not a claim of registry publication.** After publication, hosts requiring stdio can keep the existing command shape:

```json
{"mcpServers":{"meigen":{"command":"npx","args":["-y","meigen@4.0.0"]}}}
```

Requires Node.js 22.19+ (Node.js 24 recommended). This package only bridges to the same hosted server. New connections use browser OAuth; an existing MeiGen API key is retained unless `--oauth` is explicitly selected. An invalid key never silently changes to an OAuth account. Fixed API keys cannot access private library/character tools.

This is the final planned feature release of the npm runtime. Routine tool/model fixes go to the hosted server; reconnect or refresh your host's tool list after changes. Transport/security fixes may still require a bridge update. No always-current package can be promised indefinitely.

**Breaking change:** local BYOK, local file processing/downloads, `gen`, preferences and local prompt enhancement stay in **meigen@3.4.0**. Do not migrate workflows needing those features until you choose the new behavior. Existing pinned installations do not auto-upgrade. See [migration and rollback](MIGRATION.md).

## What runs where

- Remote server: discovery, generation, task recovery, uploaded references and authorized account tools. Use the live tool list and schemas, not a fixed tool count.
- This repository: connection bridge, installation helpers, Claude/OpenClaw manifests and creative guidance. No second implementation of generation, billing or search.
- Legacy [v3.4.0 source](https://github.com/jau123/MeiGen-AI-Design-MCP/tree/v3.4.0): preserved local runtime.
- Official ChatGPT store app: separate distribution. Public remote MCP does not promise the same result cards or app UI; rendering depends on the host.

The remote server cannot read your local file path. Use supported uploads or accessible direct URLs. Keep the original `requestId` and inputs after an interrupted submission; query task status before retrying. Never create a replacement paid job just because a response was lost.

## Development and release

Use pnpm: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm build`. See [release gates](RELEASING.md) and [4.0 release notes](RELEASE_NOTES_4.0.0.md). Source, npm, marketplace bundles and server deployment have separate publication boundaries.

MIT licensed client bridge; hosted service implementation is not distributed in this package.
