# Migrating to remote MeiGen (4.0)

4.0.0 is published on npm. It is a major-version migration. Native remote connections can already use `https://www.meigen.ai/api/mcp` without waiting for npm.

| Existing installation | Action | Account / behavior |
| --- | --- | --- |
| Native remote OAuth | Keep it; refresh tools after server updates | No npm dependency |
| npm with MeiGen API key | Back up config privately; change its pin once to 4.0.0 after publication | Same key; hosted tools; no private-library access |
| npm without keys | Use native HTTP, or 4.0.0 browser OAuth | Sign in to the intended account |
| npm with BYOK or custom endpoint | Keep `meigen@3.4.0`, or explicitly choose MeiGen OAuth | Never silently redirect provider billing |
| npm with local files, auto-downloads, preferences, prompt enhancement or `gen` | Keep `meigen@3.4.0` until the caller is adapted | Remote returns URLs; no local file processor |
| OpenClaw bundle with saved local overrides | Back up and deliberately replace the active override | Bundles cannot rewrite host-owned saved entries |

Before migration, finish pending jobs or retain their original request IDs, generation IDs and exact inputs. Do not resubmit them with new IDs on another connection. Verify the same account and query task status. Public discovery succeeds without authentication and does not prove balance/library access.

After changing connection, reconnect and refresh tool schemas. The bridge forwards the server's tool descriptions, parameters, structured results and instructions. It does not offer legacy aliases, removed tools or local behavior. A cached BYOK provider selection or automatic-download request is rejected before forwarding; update the caller rather than removing its intent silently. Native HTTP clients must also refresh their schemas.

An existing MeiGen key stays on a fixed-key transport even when it fails. `--oauth` explicitly selects account sign-in and bypasses old keys/config. Switching identity or provider requires the user's choice. Invalid existing configuration fails without writing it. Do not print keys during migration. Old credentials remain intact and are not revoked by this release.

If the connection drops or times out, preserve the original request ID and query status before starting another paid task. The bridge never automatically creates a replacement job.

## Retired Claude plugin

The dedicated Claude plugin is no longer maintained or distributed. Move to native remote MCP; the server continues to provide tools without plugin-specific commands or agents. See the [migration steps](https://github.com/jau123/MeiGen-AI-Design-MCP/blob/main/plugin/README.md). Existing cached installations are not automatically removed, and authorizations are not revoked. Preserve legacy provider settings and keep one active connection.

## Rollback

Stop the new connection, restore your private client-config backup and pin **meigen@3.4.0**. Do not keep duplicate active MeiGen servers. Existing installations pinned to older versions stay there until changed. A remote server rollback is a separate Web deployment; rolling back npm does not roll back hosted business behavior. Source is retained in [v3.4.0](https://github.com/jau123/MeiGen-AI-Design-MCP/tree/v3.4.0).

## Updates after this release

This is the final planned npm feature release. New tools, schemas and generation/search fixes deploy remotely. A host may cache its tool list, so reconnect/refresh before using changes. Security or transport/protocol changes can still require a bridge patch; native HTTP avoids this local dependency. Old 3.4.0 is frozen, not a promise of indefinite compatibility with future APIs.

Public remote MCP and the official ChatGPT app remain separate products. Public clients use their own result rendering; the bridge does not add the official app's interactive cards.

## Client protocol note

The pinned OAuth transport reserves JSON-RPC request IDs beginning with `mcp-remote-`. Standard numeric IDs and other string IDs are supported; a custom host using that reserved prefix must change its ID allocator or use native HTTP. Fixed-key mode does not have this dependency limitation.
