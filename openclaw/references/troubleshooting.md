# Troubleshooting

## Common Issues

**"No image generation providers configured"**
-> Set `MEIGEN_API_TOKEN` or configure an alternative provider in `~/.config/meigen/config.json`

**Timeout during generation**
-> Image generation typically takes 10-30 seconds. During high demand, it may take longer. The server polls with a 5-minute timeout.

**ComfyUI connection refused**
-> Ensure ComfyUI is running and accessible at the configured URL. Test with: `curl <url>/system_stats`

**"Model not found"**
-> Run `list_models` to see available models for your configured providers.

**Reference image rejected**
-> Reference images require accessible URLs. Use `upload_reference_image` to prepare images first. ComfyUI users can pass paths directly.

**"Not found" or path error with reference images**
-> Use the `upload_reference_image` tool — it validates format, optimizes size, and returns a temporary URL. If the tool is unavailable, ask the user to provide an image URL directly instead.

**Reference image URL expired**
-> URLs from `upload_reference_image` expire after 24 hours. Re-run the tool if the URL is no longer accessible.

## Security & Privacy

**Pinned package**: This skill runs as an MCP server via `npx meigen@1.2.6` (pinned version, not floating). The package is published on [npmjs.com](https://www.npmjs.com/package/meigen) with full source code at [GitHub](https://github.com/jau123/MeiGen-AI-Design-MCP). No code is obfuscated or minified beyond standard TypeScript compilation.

**Reference images**: The `upload_reference_image` tool validates and optimizes user-specified images (max 2MB, 2048px) for use as style references. This is always user-initiated and requires explicit invocation — nothing runs automatically. Generated URLs expire after 24 hours.

**API tokens**: `MEIGEN_API_TOKEN` is stored in environment variables or `~/.config/meigen/config.json` with `chmod 600` permissions. Tokens are only sent to the configured provider and never logged or transmitted elsewhere.

**No telemetry**: The MCP server does not collect analytics or usage data.
