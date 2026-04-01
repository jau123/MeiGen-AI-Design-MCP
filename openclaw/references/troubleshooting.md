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
-> Pass local file paths or public URLs directly to `generate_image`'s `referenceImages` parameter. Local files are automatically compressed and uploaded.

**Reference image path not found**
-> Verify the file path exists and is an absolute path. Supported formats: JPEG, PNG, WebP, GIF.

## Security & Privacy

**Pinned package**: This skill runs as an MCP server via `npx meigen@1.2.7` (pinned version, not floating). The package is published on [npmjs.com](https://www.npmjs.com/package/meigen) with full source code at [GitHub](https://github.com/jau123/MeiGen-AI-Design-MCP). No code is obfuscated or minified beyond standard TypeScript compilation.

**Reference images**: When local file paths are passed to `generate_image`'s `referenceImages`, the image is compressed (max 2MB, 2048px) and temporarily uploaded for API providers. This is always user-initiated — no files are accessed automatically. ComfyUI passes local files directly to the workflow without uploading.

**API tokens**: `MEIGEN_API_TOKEN` is stored locally in environment variables or `~/.config/meigen/config.json` with `chmod 600` permissions. Tokens are only sent to the configured provider's API endpoint and never logged or transmitted elsewhere.

**No telemetry**: The MCP server does not collect analytics, usage data, or send any information to third parties beyond the configured image generation provider.
