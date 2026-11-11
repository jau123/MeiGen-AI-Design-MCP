# MeiGen Claude marketplace plugin

Plugin version 4.0.1 uses native Streamable HTTP at `https://www.meigen.ai/api/mcp`. Tools update remotely; creative commands/skills remain in this bundle. Sign in using Claude's MCP connection settings. No npm runtime or API key is needed for a new connection.

Inspect existing host entries before upgrading: a saved stdio/key/BYOK override may take precedence. Preserve it privately, deliberately select remote OAuth, and keep one active MeiGen connection. Never switch a third-party provider to paid MeiGen generation implicitly. Local-only workflows can remain on `meigen@3.4.0`; see [migration](../MIGRATION.md).

Generation uses purchased credits only. Private library and character tools require their OAuth permissions. The server cannot read local paths; use supported uploads or direct URLs. Results are rendered/downloaded by the host. Legacy configuration checks and automatic local-image-opening hooks are removed.

Use `/meigen:setup`, `/meigen:models`, `/meigen:find` and `/meigen:gen` as needed. Tool discovery does not prove authentication, and setup must not run paid generations. The bundled OpenClaw compatibility manifest is remote too; the separately distributed `meigen-ai-design` bundle has its own version and publication step.

Version 4.0.1 supports Claude Code's plugin-scoped tool names as well as an existing manual `meigen` connection. Keep one active connection; the aliases do not install a second server.
