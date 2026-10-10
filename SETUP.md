# MCP client setup

> Upgrading from 2.x? Read the [3.0 migration notes](RELEASE_NOTES_3.0.0.md) before updating. ComfyUI and the bundled offline prompt library have been removed; private-library access uses remote OAuth.

[Back to README](README.md) · [中文](SETUP.zh-CN.md)

For ChatGPT, [install MeiGen from the official ChatGPT store](https://chatgpt.com/plugins/plugin_asdk_app_6ab66d24f56481919361b6c33f7c1928) and sign in. This guide covers optional manual MCP connections, local servers and workflow integrations.

## Authentication

Remote endpoint: `https://www.meigen.ai/api/mcp` (Streamable HTTP). In an OAuth-compatible client, choose Connect / Authenticate and complete MeiGen sign-in and consent. See the [remote guide](https://docs.meigen.ai/en/mcp/remote) for client compatibility.

New users should use OAuth account sign-in. If the host cannot authenticate, choose a supported host or the official ChatGPT plugin. API keys are only retained for existing legacy integrations, not offered as a new-user alternative. Private favorites, boards, history and item details require OAuth and are unavailable to API keys or local stdio.

Public gallery, model and Skill lookups do not spend generation credits. Cloud generation uses purchased credits, not daily free credits. Query `list_models` / `list_skills` for current options and prices. Revoke OAuth access in [Connected apps](https://www.meigen.ai/oauth/connections).

## Client configuration

Local examples pin `meigen@3.0.0`; Node.js 22+ is recommended. Reconnect after configuration changes, then call `list_skills` to verify the actual connection without paid generation.

<a id="codex-manual"></a>

### Manual MCP for Codex (optional)

Use the settings below if you need explicit MCP configuration, local npm tools or the IDE extension, where plugins are not available. Codex clients share MCP configuration on the same host. See the [official Codex MCP guide](https://developers.openai.com/codex/mcp).

**Remote — recommended for MeiGen Cloud and Skills:**

```bash
codex mcp add meigen --url https://www.meigen.ai/api/mcp
codex mcp login meigen
```

When switching an existing entry to OAuth, remove its fixed Authorization header or `bearer_token_env_var`; keep other servers. For longer Skills, set `tool_timeout_sec = 240` in the existing entry. OAuth requires a compatible client version.

### Legacy stdio / API-key compatibility

The examples below preserve existing local CLI and API-key integrations. They do not add OAuth or private-library tools to npm. Do not create a new MeiGen key for these examples; new connections use remote OAuth above. Existing API keys remain compatible with generation, public search and Skills, including fixed-key remote connections, but cannot access the private library. New connections use remote OAuth.

**Existing local configuration — for automatic local-file preparation and local-only tools:** use this entry **instead of** the remote entry. Node.js 22 or newer is recommended.

```toml
[mcp_servers.meigen]
command = "npx"
args = ["-y", "meigen@3.0.0"]
env_vars = ["MEIGEN_API_TOKEN"]
startup_timeout_sec = 90
tool_timeout_sec = 240
```

This forwards your locally configured `MEIGEN_API_TOKEN` to the npm process. To register just the local command with the CLI, use `codex mcp add meigen -- npx -y meigen@3.0.0`, then add the environment forwarding and timeout settings shown above. `meigen init codex` is not supported; use Codex's own MCP configuration.

Restart/reconnect after setup. In Codex CLI, `codex mcp list` checks registration and `/mcp` shows connection status. Then ask **“List MeiGen's available Skills and current prices”** to verify an actual tool call without generating or spending credits. A saved configuration alone does not prove that the server connected. Longer video jobs may need a longer tool timeout.

### Cursor / VS Code / Windsurf / Roo Code

For an existing stdio connection, back up the config and edit only its npm package version in `args` to `meigen@3.0.0`. Keep its `env`, timeouts, custom options and other servers. Do not replace the whole entry to upgrade. For JSONC, preserve comments and edit the version manually.

The 3.0.0 initializer also supports legacy local setup:

```bash
npx -y meigen@3.0.0 init cursor      # Cursor
npx -y meigen@3.0.0 init vscode      # VS Code / GitHub Copilot
npx -y meigen@3.0.0 init windsurf    # Windsurf
npx -y meigen@3.0.0 init roo         # Roo Code
npx -y meigen@3.0.0 init claude      # Claude (project-level)
```

The 3.0.0 `init` command requires strict JSON. It rejects invalid JSON, JSONC, invalid server maps and existing remote connections without changing the file. It updates an existing entry only when it recognizes a direct `npx` MeiGen invocation: an optional `-y` or `--yes`, followed by just `meigen`, `meigen@latest` or `meigen@<full-version>`. It preserves the executable path, environment, timeouts, other options and other servers. OAuth proxies such as `mcp-remote` remain untouched even when their type is `stdio`; shell wrappers, custom commands and other package managers require manual edits. Before atomically replacing an existing file, it creates a private `.bak` copy beside it and prints that path. Keep the backup private because it may contain credentials. These safeguards do not apply to older published initializers.

`init` writes a configuration that follows the default npm release tag; the manual examples in this guide pin 3.0.0. To pin an initialized connection too, change its `args` to `["-y", "meigen@3.0.0"]` and restart the host.

For npm `search_gallery`, keep the combined query and category within 200 UTF-16 code units. `limit` must be an integer from 1–20 (default 3; actual maximum 3 results) and `offset` an integer from 0–100000. Reuse the returned query, snapshot ID and `nextOffset` to request another batch.

<a id="openclaw"></a>

### OpenClaw

Use a current OpenClaw release with native HTTP MCP and OAuth (validated with 2026.9.9). The [ClawHub plugin](https://clawhub.ai/plugins/meigen-ai-design) includes creative guides and remote MeiGen tools:

```bash
openclaw plugins install clawhub:meigen-ai-design
# New connection only
openclaw mcp add meigen --url https://www.meigen.ai/api/mcp --transport streamable-http --auth oauth --timeout 240
openclaw mcp login meigen
```

Sign in and approve access yourself in the browser. Login needs a saved `mcp.servers.meigen` entry even when supplied by the bundle; the saved entry overrides the default without duplicating tools. `mcp add` refuses to overwrite an existing entry. Reuse a matching OAuth entry; never blindly use `mcp set`.

Run `openclaw mcp doctor meigen --probe`, then start a new conversation and ask MeiGen to list Skills and prices. Verify an actual tool call, not just installation. No generation is needed. Private favorites, boards and history require the library OAuth permissions. Generation uses purchased credits.

**Upgrading the ClawHub plugin from 3.x to 4.0:** the default changes from local stdio to remote OAuth. Back up existing configuration first. Saved local, wrapper or BYOK entries are not migrated and still override the bundle. Choose whether to retain their local capabilities or deliberately switch to remote OAuth, preserving old credentials in your private backup. Keep one active MeiGen connection. Remote tools do not provide local preferences, local prompt enhancement, automatic local-file handling or BYOK. The runtime ID stays `meigen`; distribution ID stays `meigen-ai-design`.

For a direct remote connection without creative guides, skip the plugin install and use the same add/login commands. The standalone Skill (`npx clawhub@latest install creative-toolkit`) supplies guidance only; do not install it alongside the bundle's copy. No mcporter prerequisite is needed for remote OpenClaw.

### Use as CLI (no MCP host required)

For shell scripts, CI pipelines, or anyone who wants AI image generation without an MCP host, MeiGen ships a one-shot `gen` command in the same npm package.

```bash
# Legacy CLI only: use an existing key privately; new users connect via remote OAuth
export MEIGEN_API_TOKEN=meigen_sk_...

# Generate
npx -y meigen@3.0.0 gen --prompt "a calico cat in a sunlit kitchen"

# With a specific model + aspect ratio
npx -y meigen@3.0.0 gen -p "tech logo" -m midjourney-v8.1 -r 1:1

# With a reference image (local file auto-uploaded)
npx -y meigen@3.0.0 gen -p "product hero shot" --ref ~/Desktop/bottle.jpg

# Submit only — print generationId without polling (good for CI)
npx -y meigen@3.0.0 gen -p "..." --no-wait

# Machine-readable output (good for jq pipes)
npx -y meigen@3.0.0 gen -p "..." --json | jq -r '.imageUrls[0]'
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
      "args": ["-y", "meigen@3.0.0"],
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
    args: ["-y", "meigen@3.0.0"]
    env:
      MEIGEN_API_TOKEN: "meigen_sk_..."
    timeout: 2700         # generate_video polls until the server reports a terminal state (long videos can run 15+ min) — default 120s is not enough
    connect_timeout: 120  # first npx download can take a minute
```

> The `timeout: 2700` and `connect_timeout: 120` overrides are important — Hermes defaults (120s / 60s) are tuned for short-running tools and will time out on video generation or first-run npx downloads.

## Providers

| Provider | Configuration | Scope |
|---|---|---|
| MeiGen Cloud | Remote OAuth account sign-in | Images, videos, five Skills and authorized account-library tools |
| Existing legacy integrations | Existing `MEIGEN_API_TOKEN` only | Generation, public search and Skills compatibility; no private library |
| OpenAI-compatible API | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | Local general image generation; provider billing |

Claude plugin users can run `/meigen:setup`; other clients use their own connection settings. Automatic preview is off by default. Set `MEIGEN_AUTO_OPEN=1` in the plugin host environment to open saved results on macOS.

## Configuration file and environment

### Config file

Configuration is stored at `~/.config/meigen/config.json`.

### Environment Variables

Environment variables take priority over the config file.

| Variable | Description |
|----------|-------------|
| `MEIGEN_API_TOKEN` | Existing legacy MeiGen key for generation, public search and Skills; no private library. New connections use remote OAuth |
| `MEIGEN_BASE_URL` | Local server API origin; default `https://www.meigen.ai`. Use an explicit local origin for backend development. |
| `MEIGEN_REQUEST_STORE_DIR` | Private local receipt directory (default `~/.meigen/requests`). Use an absolute path to an owned writable directory; POSIX permissions must be 0700, with no symlink. If storage is unavailable, generation uses process memory and returns `receiptWarning`; persist the returned request ID and exact inputs in your workflow for restart recovery. |
| `UPLOAD_GATEWAY_URL` | Local reference upload gateway; default `https://gen.meigen.ai`. Independent of `MEIGEN_BASE_URL`. |
| `OPENAI_API_KEY` | Your API key (any OpenAI-compatible provider) |
| `OPENAI_BASE_URL` | API base URL — change this to use Together AI, Fireworks AI, etc. |
| `OPENAI_MODEL` | Model ID supported by your endpoint |
| `MEIGEN_OUTPUT_DIR` | Override the local save directory for generated images (default: `~/Pictures/meigen`). Useful for sandboxed hosts (e.g. OpenClaw) where the default path is unreachable. |
| `MEIGEN_VIDEO_OUTPUT_DIR` | Override the local save directory for generated videos (default: `~/Movies/meigen`). |
| `XDG_PICTURES_DIR` | Linux only — when `MEIGEN_OUTPUT_DIR` is unset, images are saved to `$XDG_PICTURES_DIR/meigen` if this env var is set (e.g. by your desktop environment). Falls back to `~/Pictures/meigen`. |
| `XDG_VIDEOS_DIR` | Linux only — same logic as `XDG_PICTURES_DIR` but for videos. Falls back to `~/Movies/meigen`. |

## Privacy

MeiGen MCP respects your privacy. Here's what happens with your data:

- **MeiGen Cloud and Skills** — Prompts and reference images are processed by MeiGen and its generation providers; result images are stored on Cloudflare R2. See [MeiGen Privacy Policy](https://www.meigen.ai/privacy-policy).
- **OpenAI-compatible** — Prompts and reference images are sent to the configured API endpoint. See your provider's privacy policy.
- **Reference image upload** — Local files use the configured upload gateway (default `gen.meigen.ai`) and Cloudflare R2. Local MCP ordinary generation and standard Skill references target 4096px / 8 MiB; the standalone `meigen gen` CLI retains its 2 MiB target. Upscale keeps original dimensions and uses the [Skill API limits](SKILLS_API.md#upscale). Skill preparation removes metadata and preserves transparency; GIF references use the first frame. Remote Skill uploads require MeiGen account authorization (OAuth or API key). Reference URLs are accessible to anyone with the link. Preserve accepted URLs for retries, keep your originals and download results you need; URLs are not promised as permanent archival storage.
- **Gallery search** — Search queries, including optional category topics, are sent to the live MeiGen API at `www.meigen.ai`. No bundled offline prompt library is included; unavailable searches return an explicit error. **Prompt enhancement** runs locally with no external calls.

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
| New Skills do not appear | Remote: refresh/reconnect the tool list after the backend is deployed. Local: confirm the connection runs `meigen@3.0.0`, then restart. Installing npm alone does not deploy the APIs. |
| Missing account authorization | Connect remote MCP with OAuth and sign in. For an existing legacy integration only, privately check its configured key and reconnect; do not send credentials in chat. |
| Insufficient credits, but the website shows a balance | API calls use **purchased credits only**, never daily free credits. Use [Profile → Top Up](https://www.meigen.ai/profile) on the same account; then ask the assistant to continue. A rejected call should not be polled. |
| The image cannot be uploaded | Use a real local file (local npm) or a public direct HTTPS image link. Check format/size and remove login or redirect requirements. If the host cannot read attachments, use a direct link. Upload failure has not started a generation. |
| A tool timed out or the host restarted | Recover Skills with `check_skill`, and ordinary image/video jobs with `check_generation`; do not automatically submit a new paid request. A host with a 60-second tool timeout may need a longer timeout, such as 240 seconds for Skill submission. |
| Some product-detail modules failed | Keep and display completed images; show the failed modules and their reported refund state. Do not regenerate the whole batch or add paid replacements automatically. |
| The request is rate-limited | Follow the returned waiting instruction. A daily request limit is separate from the credit balance; repeated polling or topping up does not reset it. |
| I configured OpenAI, but a Skill still asks for a MeiGen key | Those backends support local general image generation. The five Skills use MeiGen Cloud and purchased credits. |

For Skill client implementers: generate `requestId` internally, keep it with the original inputs, and query `check_skill` after interruptions. Follow `nextAction`; processing responses normally suggest a 10-second polling interval. Reuse returned `retryParameters` exactly, including uploaded URLs. A new ID represents a new paid attempt; changing inputs under an existing ID is rejected. These IDs belong in the client, not in questions to the user.

<a id="upgrading"></a>

## Upgrade from earlier versions

- **Remote MCP:** keep the endpoint and reconnect with OAuth account sign-in; remove any fixed Authorization header when switching. After backend deployment, reconnect and call `list_skills`; verify the installed tool list. Updating npm alone does not deploy the APIs.
- **Local npm:** change pinned configurations to `meigen@3.0.0` and restart; global installations can run `npm install -g meigen@3.0.0`. Check that the version is available on npm first.
- **Plugin users:** update the Claude marketplace plugin, OpenClaw ClawHub bundle or standalone ClawHub Skill separately. Updating npm alone does not replace installed instruction files. Keep one effective server. OpenClaw OAuth login requires a saved entry with the same `meigen` name, which overrides its bundle default.
- **Composable calls:** local `wait: true` / `download: true` remain defaults. New workflows should persist UUID `requestId`, use `wait: false` and recover by that ID. Remote legacy `attemptId` remains accepted; older receipts cannot retroactively prove every historical parameter mismatch. Update plugin instructions as well as the server to get the optional creative flow.
- **Existing configuration and jobs:** general generation keeps its MeiGen/OpenAI configuration; the five Skills need an authorized MeiGen account and purchased credits. Preserve IDs and inputs for interrupted jobs and recover them; an upgrade is not a reason to resubmit a paid request.
- **Input changes:** local Skill paths must be absolute, `~/` or `file://`; relative paths are rejected instead of being resolved against a hidden process directory. Images lose metadata, GIF references use the first frame, and Upscale needs a still original. Keep original assets and download results you need; result links are not a permanent-storage guarantee.

Account-library tools are available only through the remote OAuth connection at `https://www.meigen.ai/api/mcp`, after MeiGen sign-in and consent. API keys and local npm cannot access favorites, boards, history or item details. Lists return prompt excerpts; use the remote `get_library_item` tool to read a selected full prompt in Unicode code-point pages (default 8000, maximum 16000). `prompt.length` is the total safe prompt length; `nextOffset=null` marks the final part. Full data appears once in `structuredContent`; text is a short summary.
