# Claude plugin retired

The dedicated MeiGen Claude plugin is no longer maintained or distributed. Use the native remote MCP connection instead; image/video generation, inspiration search and account-library tools remain available through it. Plugin-specific slash commands, agents and output styles are retired.

## Migrate an existing installation

1. Finish pending jobs or retain their original request IDs and inputs. Back up existing connection settings privately; do not expose credentials.
2. Disable the MeiGen plugin in Claude's plugin manager. Preserve any existing manual MeiGen connection; do not overwrite a legacy stdio, API-key or BYOK configuration automatically.
3. Add or reuse `https://www.meigen.ai/api/mcp` as a remote HTTP MCP connection and sign in through the host. In Claude Code, add a new connection with `claude mcp add --transport http meigen https://www.meigen.ai/api/mcp`, then authenticate in `/mcp`. Use Claude Web/Desktop's connector settings for those clients.
4. Verify with `list_models` and `list_skills`, then verify the intended account before using private tools or generating. Public discovery alone does not prove account access. Keep only one active MeiGen connection; remove the disabled plugin when migration is complete.

Removing this source does not uninstall cached plugins or revoke existing account authorizations. Historical plugin 4.0.1 source is retained in [the last maintained revision](https://github.com/jau123/MeiGen-AI-Design-MCP/tree/b4251902fc393b36c6cc32982756e8a000d6f1cd/plugin).

[Connection guide](../SETUP.md) · [Migration and legacy workflows](../MIGRATION.md)
