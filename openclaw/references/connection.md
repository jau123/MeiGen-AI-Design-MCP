# Connect and migrate

Use a current OpenClaw version supporting remote Streamable HTTP MCP and browser OAuth. For new users, install `clawhub:meigen-ai-design` through the OpenClaw plugin manager. This bundle supplies the remote connection and this guide; do not also install the standalone Skill.

With the user's setup authorization, inspect existing MCP entries privately. Reuse a matching entry; do not print credentials or overwrite a stdio, API-key or BYOK connection. For a new saved connection:

```bash
openclaw mcp add meigen --url https://www.meigen.ai/api/mcp --transport streamable-http --auth oauth --timeout 240
openclaw mcp login meigen
```

The login command needs a saved entry; it can override the matching bundle default. If `meigen` already exists, inspect and reuse it instead of blindly running `mcp set`. Keep one active MeiGen connection.

Let the user finish browser login and requested consent, then run `openclaw mcp doctor meigen --probe` and call `list_models` or `list_skills`. Do not generate or upload as a login test. Public discovery does not prove private-account access; verify the intended account before paid work.

The standalone `creative-toolkit` listing supplies this same guide, not an MCP server. Existing users can keep their remote connection; new users should prefer the plugin. Legacy local/BYOK workflows remain separate: preserve their configuration and credentials until the user chooses to migrate. See the [migration guide](https://github.com/jau123/MeiGen-AI-Design-MCP/blob/main/MIGRATION.md).
