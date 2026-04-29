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
-> Pass local file paths or URLs directly to `generate_image`'s `referenceImages` parameter. Local files are compressed locally (max 2MB, 2048px) and prepared for the selected provider.

**Reference image path not found**
-> Verify the file path exists and is an absolute path. Supported formats: JPEG, PNG, WebP, GIF.

## Security & Privacy

**Pinned package**: This skill runs as an MCP server via `npx meigen@1.2.11` (pinned version, not floating). The package is published on [npmjs.com](https://www.npmjs.com/package/meigen) with full source code at [GitHub](https://github.com/jau123/MeiGen-AI-Design-MCP). No code is obfuscated or minified beyond standard TypeScript compilation.

**Reference images**: Reference images are always user-initiated — the server only reads a file when the user explicitly passes its path to `generate_image`. Local files are resized in-memory (max 2MB, 2048px) before being handed to the user's configured image provider. No files are accessed automatically or indexed in the background. ComfyUI routes local files directly into the local workflow without any network hop.

**API tokens**: `MEIGEN_API_TOKEN` is stored locally in environment variables or `~/.config/meigen/config.json` with `chmod 600` permissions. Tokens are only sent to the configured provider's API endpoint and never logged or transmitted elsewhere.

**No telemetry**: The MCP server does not collect analytics, usage data, or send any information to third parties beyond the configured image generation provider.
