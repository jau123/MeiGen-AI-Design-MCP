# Troubleshooting

- **Missing tools:** enable the plugin or saved MCP connection, confirm `https://www.meigen.ai/api/mcp`, then reconnect and refresh tools. Installation alone does not establish OAuth access.
- **Login or consent:** use the host's browser OAuth flow. Public discovery can succeed without account access. Inspect saved overrides privately; never replace credentials or switch accounts automatically.
- **Interrupted generation:** keep the original request ID, inputs and returned handles. Query the matching status tool and follow its recovery instructions. A failed response does not prove that no job started or no credits were charged.
- **Reference errors:** inspect the live input schema and use real readable attachments or accessible URLs. Follow the selected tool's media preparation rules; never invent paths or attachment URLs.
- **Missing previews:** use returned media URLs. Interactive pages and downloads depend on host support; the connection guide does not add a UI renderer.

For legacy local/BYOK settings, follow [migration](https://github.com/jau123/MeiGen-AI-Design-MCP/blob/main/MIGRATION.md) without deleting the old configuration. For help, use [MeiGen support](https://www.meigen.ai/mcp).
