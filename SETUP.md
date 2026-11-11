# Connect MeiGen

## Native remote connection

Use Streamable HTTP at `https://www.meigen.ai/api/mcp` and authenticate through the host's OAuth flow. Do not paste credentials into chat. Reuse an existing matching connection; preserve old configuration privately before replacing it.

- Claude Code: `claude mcp add --transport http meigen https://www.meigen.ai/api/mcp`, then authenticate in `/mcp`.
- Cursor: MCP settings, remote URL above; JSON entry: `{"type":"http","url":"https://www.meigen.ai/api/mcp"}` under `mcpServers.meigen`.
- VS Code: the same entry under `servers.meigen` in `.vscode/mcp.json`.
- OpenClaw: `openclaw mcp add meigen --url https://www.meigen.ai/api/mcp --transport streamable-http --auth oauth --timeout 240`, then `openclaw mcp login meigen`. Saved entries take precedence over bundle defaults; do not overwrite one blindly.

Check `list_models` and `list_skills` without generating. Public discovery proves connectivity, not a signed-in account. For favorites/history, let the host request library consent. Read-only library access and generating are separate permissions.

## npm fallback for stdio hosts

The prepared 4.0.0 bridge requires Node.js 22.19+ (24 recommended). **Publish before using this registry command:**

```json
{"mcpServers":{"meigen":{"command":"npx","args":["-y","meigen@4.0.0"]}}}
```

New connections open browser OAuth when needed. The bridge uses the pinned `mcp-remote` dependency; OAuth tokens are managed by that library under `~/.mcp-auth` (or `MCP_REMOTE_CONFIG_DIR`). `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` are passed to the OAuth transport. API-key transport uses Node fetch; proxy behavior is not promised on all supported Node versions. Reconnect after changing environment or credentials.

An existing `MEIGEN_API_TOKEN` takes precedence over `meigenApiToken` in `~/.config/meigen/config.json`. The file is read only, never migrated or rewritten. A malformed file or invalid token fails safely. To explicitly use account OAuth instead, add `--oauth` after the package name; that bypasses the saved key and BYOK configuration. Never request secrets in chat. OAuth account identity may differ from the old key account: verify your account before generating.

BYOK-only configuration stops with migration guidance. No key or credential is sent to a custom `MEIGEN_BASE_URL`; keep custom endpoints on 3.4.0 or configure a distinct host connection. The remote bridge uses purchased MeiGen credits, not third-party BYOK billing.

## Optional configuration helper

After publication, `npx -y meigen@4.0.0 init cursor` (or `vscode`, `claude`) can add a native HTTP entry. It never converts an existing stdio/wrapper/key entry automatically. Existing matching HTTP entries are kept byte-for-byte. Other client settings are preserved and a private backup is made before adding to an existing config. JSONC is not rewritten: edit comments/trailing commas through your host instead.

## Files, recovery and legacy use

The remote server cannot read local paths or auto-save outputs on your machine. Supply a real direct HTTPS URL or use supported upload tools with readable bytes. Inspect the live schemas; remote references and uploads have their own limits. Results are URLs, rendered/downloaded by your host.

For a lost generation response, keep the original request ID and query `check_generation` / `check_skill`. Do not create a new paid request just to test connectivity. Generation and five image workflows use purchased credits only; current prices come from live discovery.

For BYOK, local file handling, preferences or `meigen gen`, keep **meigen@3.4.0** and its [frozen setup guide](https://github.com/jau123/MeiGen-AI-Design-MCP/blob/v3.4.0/SETUP.md). See [migration](MIGRATION.md) before upgrading.
