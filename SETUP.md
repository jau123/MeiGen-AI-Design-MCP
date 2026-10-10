# MCP client setup

[Back to README](README.md) · [中文](SETUP.zh-CN.md)

For ChatGPT and Codex, [install MeiGen from the official ChatGPT store](https://chatgpt.com/plugins/plugin_asdk_app_6ab66d24f56481919361b6c33f7c1928) and sign in. This guide covers optional manual MCP connections, local servers and workflow integrations.

## Authentication

Remote endpoint: `https://www.meigen.ai/api/mcp` (Streamable HTTP). In an OAuth-compatible client, choose Connect / Authenticate and complete MeiGen sign-in and consent. See the [remote guide](https://docs.meigen.ai/en/mcp/remote) for client compatibility.

If OAuth is unavailable, create a private key at [API Keys](https://www.meigen.ai/profile/api-keys) in a desktop browser. Use `Authorization: Bearer <MeiGen API key>` for remote MCP, or `MEIGEN_API_TOKEN` in the local server environment. Do not combine a fixed key with OAuth or put credentials in chat, URLs or source control.

Public gallery, model and Skill lookups do not spend generation credits. Cloud generation uses purchased credits, not daily free credits. Query `list_models` / `list_skills` for current options and prices. Revoke OAuth access in [Connected apps](https://www.meigen.ai/oauth/connections).

## Client configuration

Local examples pin `meigen@2.0.2`; Node.js 22+ is recommended. Reconnect after configuration changes, then call `list_skills` to verify the actual connection without paid generation.

<a id="codex-manual"></a>

### Manual MCP for Codex (optional)

Use the settings below if you need explicit MCP configuration, local npm tools or the IDE extension, where plugins are not available. Codex clients share MCP configuration on the same host. See the [official Codex MCP guide](https://developers.openai.com/codex/mcp).

**Remote — recommended for MeiGen Cloud and Skills:**

```bash
codex mcp add meigen --url https://www.meigen.ai/api/mcp
codex mcp login meigen
```

When switching an existing entry to OAuth, remove its fixed Authorization header or `bearer_token_env_var`; keep other servers. For longer Skills, set `tool_timeout_sec = 240` in the existing entry. General OAuth requires the server rollout and a compatible client version.

**API key fallback:** add `--bearer-token-env-var MEIGEN_API_TOKEN` instead of using OAuth login, and set that variable in the environment that launches Codex. A project's `.env.local` is not automatically loaded. Use private header settings if your desktop client cannot inherit that environment. Keep the key out of chat and shared files.

**Local — for automatic local-file preparation, ComfyUI and local-only tools:** use this entry **instead of** the remote entry. Node.js 22 or newer is recommended.

```toml
[mcp_servers.meigen]
command = "npx"
args = ["-y", "meigen@2.0.2"]
env_vars = ["MEIGEN_API_TOKEN"]
startup_timeout_sec = 90
tool_timeout_sec = 240
```

This forwards your locally configured `MEIGEN_API_TOKEN` to the npm process. To register just the local command with the CLI, use `codex mcp add meigen -- npx -y meigen@2.0.2`, then add the environment forwarding and timeout settings shown above. `meigen init codex` is not supported; use Codex's own MCP configuration.

Restart/reconnect after setup. In Codex CLI, `codex mcp list` checks registration and `/mcp` shows connection status. Then ask **“List MeiGen's available Skills and current prices”** to verify an actual tool call without generating or spending credits. A saved configuration alone does not prove that the server connected. Longer video jobs may need a longer tool timeout.

### Cursor / VS Code / Windsurf / Roo Code

One command to set up MeiGen for any supported AI coding tool:

```bash
npx -y meigen@2.0.2 init cursor      # Cursor
npx -y meigen@2.0.2 init vscode      # VS Code / GitHub Copilot
npx -y meigen@2.0.2 init windsurf    # Windsurf
npx -y meigen@2.0.2 init roo         # Roo Code
npx -y meigen@2.0.2 init claude      # Claude Code (project-level)
```

This writes the correct MCP config file with the right format and path for your tool. If a config file already exists, MeiGen is merged in without overwriting your other servers.

`init` writes a configuration that follows the default npm release tag; the manual examples in this guide pin 2.0.2. To pin an initialized connection too, change its `args` to `["-y", "meigen@2.0.2"]` and restart the host.

<a id="openclaw"></a>

### OpenClaw

Install the full plugin from [ClawHub](https://clawhub.ai/plugins/meigen-ai-design) (includes Skills and an explicit MCP connection; other features depend on the loader):

```bash
openclaw plugins install clawhub:meigen-ai-design
```

Or install only the skill (no commands/agents):

```bash
npx clawhub@latest install creative-toolkit
```

### Use as CLI (no MCP host required)

For shell scripts, CI pipelines, or anyone who wants AI image generation without an MCP host, MeiGen ships a one-shot `gen` command in the same npm package.

```bash
# Set your token locally (create it at https://www.meigen.ai/profile/api-keys on desktop)
export MEIGEN_API_TOKEN=meigen_sk_...

# Generate
npx -y meigen@2.0.2 gen --prompt "a calico cat in a sunlit kitchen"

# With a specific model + aspect ratio
npx -y meigen@2.0.2 gen -p "tech logo" -m midjourney-v8.1 -r 1:1

# With a reference image (local file auto-uploaded)
npx -y meigen@2.0.2 gen -p "product hero shot" --ref ~/Desktop/bottle.jpg

# Submit only — print generationId without polling (good for CI)
npx -y meigen@2.0.2 gen -p "..." --no-wait

# Machine-readable output (good for jq pipes)
npx -y meigen@2.0.2 gen -p "..." --json | jq -r '.imageUrls[0]'
```

CLI image output is saved to `~/Pictures/meigen/` (override with `MEIGEN_OUTPUT_DIR`). The five Skills return result links; your host can preview or download them.

`meigen gen --help` lists all flags.

### Other MCP-Compatible Hosts

Add to your MCP config (e.g. `.mcp.json`, `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "meigen": {
      "command": "npx",
      "args": ["-y", "meigen@2.0.2"],
      "env": {
        "MEIGEN_API_TOKEN": "meigen_sk_..."
      }
    }
  }
}
```

> Free features (inspiration search, prompt enhancement, model listing) work without any API key.

### Hermes Agent (NousResearch)

[Hermes Agent](https://github.com/NousResearch/hermes-agent) is a first-class MCP client — add MeiGen to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  meigen:
    command: "npx"
    args: ["-y", "meigen@2.0.2"]
    env:
      MEIGEN_API_TOKEN: "meigen_sk_..."
    timeout: 2700         # generate_video polls until the server reports a terminal state (long videos can run 15+ min) — default 120s is not enough
    connect_timeout: 120  # first npx download can take a minute
```

> The `timeout: 2700` and `connect_timeout: 120` overrides are important — Hermes defaults (120s / 60s) are tuned for short-running tools and will time out on video generation or first-run npx downloads.

## Providers

| Provider | Configuration | Scope |
|---|---|---|
| MeiGen Cloud | Remote OAuth or private API key; local `MEIGEN_API_TOKEN` | Images, videos and all five Skills; purchased credits |
| OpenAI-compatible API | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | Local general image generation; provider billing |
| ComfyUI | `COMFYUI_URL` plus an imported API JSON workflow | Local general image generation on your GPU |

Claude Code plugin users can run `/meigen:setup`; other clients use their own connection settings. Automatic preview is off by default. Set `MEIGEN_AUTO_OPEN=1` in the plugin host environment to open saved results on macOS.

## Configuration file and environment

### Config file

Configuration is stored at `~/.config/meigen/config.json`. ComfyUI workflows are stored at `~/.config/meigen/workflows/`.

### Environment Variables

Environment variables take priority over the config file.

| Variable | Description |
|----------|-------------|
| `MEIGEN_API_TOKEN` | MeiGen API key; required for all five Skills and MeiGen generation |
| `MEIGEN_BASE_URL` | Local server API origin; default `https://www.meigen.ai`. Use an explicit local origin for backend development. |
| `MEIGEN_REQUEST_STORE_DIR` | Private local receipt directory (default `~/.meigen/requests`). Use an absolute path to an owned writable directory; POSIX permissions must be 0700, with no symlink. If storage is unavailable, generation uses process memory and returns `receiptWarning`; persist the returned request ID and exact inputs in your workflow for restart recovery. |
| `UPLOAD_GATEWAY_URL` | Local reference upload gateway; default `https://gen.meigen.ai`. Independent of `MEIGEN_BASE_URL`. |
| `OPENAI_API_KEY` | Your API key (any OpenAI-compatible provider) |
| `OPENAI_BASE_URL` | API base URL — change this to use Together AI, Fireworks AI, etc. |
| `OPENAI_MODEL` | Model ID supported by your endpoint |
| `COMFYUI_URL` | ComfyUI server URL (default: `http://localhost:8188`) |
| `MEIGEN_OUTPUT_DIR` | Override the local save directory for generated images (default: `~/Pictures/meigen`). Useful for sandboxed hosts (e.g. OpenClaw) where the default path is unreachable. |
| `MEIGEN_VIDEO_OUTPUT_DIR` | Override the local save directory for generated videos (default: `~/Movies/meigen`). |
| `XDG_PICTURES_DIR` | Linux only — when `MEIGEN_OUTPUT_DIR` is unset, images are saved to `$XDG_PICTURES_DIR/meigen` if this env var is set (e.g. by your desktop environment). Falls back to `~/Pictures/meigen`. |
| `XDG_VIDEOS_DIR` | Linux only — same logic as `XDG_PICTURES_DIR` but for videos. Falls back to `~/Movies/meigen`. |

## Privacy

MeiGen MCP respects your privacy. Here's what happens with your data:

- **ComfyUI (local)** — A local workflow with local files can run without cloud generation. Gallery queries and MeiGen Skills still use external services.
- **MeiGen Cloud and Skills** — Prompts and reference images are processed by MeiGen and its generation providers; result images are stored on Cloudflare R2. See [MeiGen Privacy Policy](https://www.meigen.ai/privacy-policy).
- **OpenAI-compatible** — Prompts and reference images are sent to the configured API endpoint. See your provider's privacy policy.
- **Reference image upload** — Local files use the configured upload gateway (default `gen.meigen.ai`) and Cloudflare R2. Local MCP ordinary generation and standard Skill references target 4096px / 8 MiB; the standalone `meigen gen` CLI retains its 2 MiB target. Upscale keeps original dimensions and uses the [Skill API limits](SKILLS_API.md#upscale). Skill preparation removes metadata and preserves transparency; GIF references use the first frame. Remote Skill uploads require MeiGen account authorization (OAuth or API key). Reference URLs are accessible to anyone with the link. Preserve accepted URLs for retries, keep your originals and download results you need; URLs are not promised as permanent archival storage. ComfyUI can use local paths without uploading.
- **Gallery search** — With a search query, the MeiGen API is queried (your query text is sent to `www.meigen.ai`); category browsing and offline fallback use bundled local data. **Prompt enhancement** runs locally with no external calls.

The local npm server adds no telemetry. Requests sent to MeiGen are subject to its service and privacy policies.

### Custom Storage Backend

If you prefer to use your own S3/R2 bucket for reference image uploads, set the `UPLOAD_GATEWAY_URL` environment variable or `uploadGatewayUrl` in `~/.config/meigen/config.json` to point to your own presign endpoint. The endpoint must implement:

```
POST /upload/presign
Content-Type: application/json

Request:  { "filename": "photo.jpg", "contentType": "image/jpeg", "size": 123456 }
Response: { "success": true, "presignedUrl": "https://...", "publicUrl": "https://..." }
```

The `presignedUrl` is used for a `PUT` upload, and `publicUrl` is the publicly accessible URL returned to the user. This option applies to local uploads. For standard Skills, the local server automatically prepares a custom CDN URL through authenticated `/api/skills/upload` before submission. Upscale passes a public original URL to the backend for source validation and preparation. Custom gateway images must remain publicly reachable without authentication or redirects.

## Troubleshooting

| Problem | Next step |
|---|---|
| New Skills do not appear | Remote: refresh/reconnect the tool list after the backend is deployed. Local: confirm the connection runs `meigen@2.0.2`, then restart. Installing npm alone does not deploy the APIs. |
| Invalid or missing key | Create/check the key in [desktop API Keys](https://www.meigen.ai/profile/api-keys) and update the MCP connection's header or `MEIGEN_API_TOKEN`. Restart a local server after changing its environment. Do not paste the key into chat. |
| Insufficient credits, but the website shows a balance | API calls use **purchased credits only**, never daily free credits. Use [Profile → Top Up](https://www.meigen.ai/profile) on the same account; then ask the assistant to continue. A rejected call should not be polled. |
| The image cannot be uploaded | Use a real local file (local npm) or a public direct HTTPS image link. Check format/size and remove login or redirect requirements. If the host cannot read attachments, use a direct link. Upload failure has not started a generation. |
| A tool timed out or the host restarted | Recover Skills with `check_skill`, and ordinary image/video jobs with `check_generation`; do not automatically submit a new paid request. A host with a 60-second tool timeout may need a longer timeout, such as 240 seconds for Skill submission. |
| Some product-detail modules failed | Keep and display completed images; show the failed modules and their reported refund state. Do not regenerate the whole batch or add paid replacements automatically. |
| The request is rate-limited | Follow the returned waiting instruction. A daily request limit is separate from the credit balance; repeated polling or topping up does not reset it. |
| I configured OpenAI or ComfyUI, but a Skill still asks for a MeiGen key | Those backends support local general image generation. The five Skills use MeiGen Cloud and purchased credits. |

For Skill client implementers: generate `requestId` internally, keep it with the original inputs, and query `check_skill` after interruptions. Follow `nextAction`; processing responses normally suggest a 10-second polling interval. Reuse returned `retryParameters` exactly, including uploaded URLs. A new ID represents a new paid attempt; changing inputs under an existing ID is rejected. These IDs belong in the client, not in questions to the user.

<a id="upgrading"></a>

## Upgrade from earlier versions

- **Remote MCP:** keep the endpoint and your valid MeiGen key. After backend deployment, reconnect and call `list_skills`; expect five Skills and 14 tools. Updating npm alone does not deploy the APIs.
- **Local npm:** change pinned configurations to `meigen@2.0.2` and restart; global installations can run `npm install -g meigen@2.0.2`. Expect 17 tools. Check that the version is available on npm first.
- **Plugin users:** update the Claude marketplace plugin, OpenClaw native plugin or standalone ClawHub Skill separately. Updating npm alone does not replace installed instruction files. Do not add a second MCP entry when the plugin already supplies one.
- **Composable calls:** local `wait: true` / `download: true` remain defaults. New workflows should persist UUID `requestId`, use `wait: false` and recover by that ID. Remote legacy `attemptId` remains accepted; older receipts cannot retroactively prove every historical parameter mismatch. Update plugin instructions as well as the server to get the optional creative flow.
- **Existing configuration and jobs:** general generation keeps its MeiGen/OpenAI/ComfyUI configuration; the five Skills need an authorized MeiGen account and purchased credits. Preserve IDs and inputs for interrupted jobs and recover them; an upgrade is not a reason to resubmit a paid request.
- **Input changes:** local Skill paths must be absolute, `~/` or `file://`; relative paths are rejected instead of being resolved against a hidden process directory. Images lose metadata, GIF references use the first frame, and Upscale needs a still original. Keep original assets and download results you need; result links are not a permanent-storage guarantee.
