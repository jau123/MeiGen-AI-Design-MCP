# MeiGen AI Design — Claude Plugin

> 3.0.0 is prepared in this source checkout and has not been published by this change. Installation pins target the upcoming major release; verify registry availability before upgrading. Read the [3.0 migration notes](../RELEASE_NOTES_3.0.0.md) for removed ComfyUI/offline-library support and the remote OAuth account library.

AI image and video generation with guided ecommerce Skills, creative workflows, parallel general image generation, and live gallery inspiration. See the full guides in [English](../README.md) or [中文](../README.zh-CN.md).

Using **ChatGPT**? [Install MeiGen from the official ChatGPT store](https://chatgpt.com/plugins/plugin_asdk_app_6ab66d24f56481919361b6c33f7c1928). For optional manual MCP configuration, see the [advanced setup guide](../SETUP.md#codex-manual).

## Callable tools and optional creative help

The caller owns scripts, prompts, models/providers, ratios, approved count/budget, scheduling and presentation. Invoke tools directly from another Skill or agent; creative planning and the plugin agents are optional. They preserve resolved input and do not reconfirm each authorized frame, clip or batch. Discovery can support any task, and actual visual inspection is allowed before making visual claims.

For composed MeiGen jobs, persist UUID `requestId` and exact inputs, use `wait: false`, `download: false` on local npm, and resume via `check_generation(requestId=...)` or the returned generationId. Existing synchronous/download defaults remain enabled; remote MCP returns URLs without a download parameter. The caller reads structured results and manages in-flight budget reservations. Local npm bounds API submissions at four; actual backend limits remain authoritative. No blanket video-serialization or ten-image rule applies. See [workflow examples](../COMPOSABLE_WORKFLOWS.md).

## Connect an MCP Server

Use remote OAuth for a new MeiGen connection, including private favorites, boards and history. The optional plugin still bundles legacy local stdio for existing API-key/BYOK workflows; it has no OAuth implementation or private-library tools. Disable or replace the old connection through host settings when switching, keeping one active MeiGen server.

### Remote OAuth — recommended

In the host's MCP settings, add the Streamable HTTP URL `https://www.meigen.ai/api/mcp`, then choose Connect / Authenticate to sign in to MeiGen and approve account access. If a fixed Authorization header exists, remove it when switching to OAuth. Use a compatible host or the official ChatGPT plugin if this client cannot authenticate; do not create a new API key.

The server uses stateless Streamable HTTP. Accepted generation jobs and billing records remain on the server for recovery. Remote tool updates need a **backend deployment**, not an npm release; refresh or reconnect if the host caches tools. Remote generation requires internet access. Plugin instructions and local npm behavior still require their own updates when changed.

### Local — existing legacy integrations and BYOK

The official MeiGen marketplace plugin already bundles this connection. The manual example below is for a bare MCP install or a distribution without MCP wiring, such as the separate wshobson marketplace. Keep one entry.

Node.js 22 or newer is recommended. Add this server to your project's `.mcp.json`; store the key in local connection settings rather than committing it:

```json
{
  "mcpServers": {
    "meigen": {
      "command": "npx",
      "args": ["-y", "meigen@3.0.0"]
    }
  }
}
```

Existing local API keys remain compatible with generation, public search and Skills, but cannot access the private library. New connections use remote OAuth. For existing legacy integrations only, keep the existing `MEIGEN_API_TOKEN` in this server's private environment. Restart or reconnect Claude after installation or configuration changes. Do not configure both entries under different names unless you intentionally want duplicate tools.

## First-time MeiGen setup

1. Add the remote URL above and sign in through the host's OAuth flow.
2. Approve the requested account access. Private library access is only available with this OAuth connection.
3. Ask “Show available Skills and their current prices.” This public lookup does not generate or spend credits, and alone does not prove account authorization.
4. Continue the user's authorized creation request. If credits are needed, use [Profile → Top Up](https://www.meigen.ai/profile) on the connected account. Never send credentials in chat.

API generation uses **purchased credits only**. Daily free credits and Web free attempts do not apply. The five Skills require MeiGen Cloud even if OpenAI is configured.

## Choose a Skill

| Request | Tool | Required material | Optional material | Output |
|---|---|---|---|---|
| “Remove the background and give me a transparent PNG.” | `remove_background` | One source image | None | One paid cutout, including the first request |
| “Make a main shot, close-up and lifestyle image for this product.” | `generate_product_detail_images` | One product image; desired count/modules | Product facts/copy, logo, model photo, up to two extra product images | 1–6 paid images, one per module |
| “Make one poster for our weekend coffee tasting.” | `generate_marketing_poster` | A brand, event, campaign or topic | Copy, logo, up to three product images, one style image | One paid poster; no image is required |
| “Put this product on a sunlit stone counter.” | `generate_ai_background` | One product image; a setting for custom mode | White/smart/custom mode, ratio and quality | One paid image with a new background |
| “Enhance this original photo while keeping its appearance.” | `upscale_image` | One original still JPEG/PNG/WebP image | crisp (default) or creative with accepted detail changes | One paid enhanced image |

For a direct user request, the assistant chooses the Skill, prepares images and follows status; an upstream caller receives structured results and controls presentation. It should use the user's specified count or modules without asking for the same confirmation again. If product-detail count is unresolved, clarify it. MCP requires an explicit `modules` selection; only direct HTTP calls default to **three paid images** (hero/detail/scene) when modules are omitted. Use live `list_skills` prices to calculate the batch cost; do not add unrequested images. Ask to preserve exact wording when supplying final copy.

For Upscale, pass the original file/URL directly or use `upload_skill_image` with `purpose: "upscale"`. Originals may be up to 64 MiB / 64 million pixels; local encoding must fit 9,500,000 bytes without resizing (otherwise use a public original URL). Base64 remains limited to 3 MiB decoded. For `upscale_resize_required` or `price_changed`, explain the change and obtain acceptance before using a new requestId and the accepted flags/price. See the [full limits](../SKILLS_API.md#upscale).

Local npm accepts real absolute local file paths and public direct HTTPS image URLs. For remote MCP, use `upload_skill_image` with a public direct URL (up to 8 MiB) or actual readable attachment bytes (up to 3 MiB decoded), then pass the returned URL to the Skill. Existing supported MeiGen image URLs can be used directly. Private-network sources, redirects, login-protected links and IPv6-only sources are unsupported. Uploading prepares a reference and does not spend generation credits. If the host cannot read an attachment, use a direct image link or local npm.

New paid requests get a client-generated `requestId`. After interruption, use `check_skill` with the original key, Skill and ID; follow `nextAction` and preserve returned `retryParameters` exactly. Typical polling is every 10 seconds. Display completed modules and their resource links; report failures/refund states individually. Do not ask users for UUIDs or automatically submit a new paid batch to replace failed modules.

## Other Providers for Local General Image Generation

`generate_image` in the local npm server also supports the following providers. They do **not** replace MeiGen Cloud for the five Skills or for MeiGen video generation. The plugin's `/meigen:setup` command can explain provider settings; keep credentials in local connection settings/configuration.

### OpenAI-compatible API

Configure `OPENAI_API_KEY`, `OPENAI_BASE_URL` and `OPENAI_MODEL` for your image provider in the MCP server's environment. Use a model and endpoint supported by that provider; it handles its own billing. These settings apply to local general image generation, not Skills.

## Agents

These optional plugin agents support general image workflows; direct tool calls are equally supported. The five Skills perform their own planning and do not require them.

| Agent | Model | Purpose |
|---|---|---|
| `gallery-researcher` | haiku | Search gallery, find references, build mood boards |
| `prompt-crafter` | haiku | Craft requested prompts while preserving storyboard continuity |
| `image-generator` | inherit | Execute `generate_image` calls and relay results |

Auto-preview is off by default. To open saved images on macOS, explicitly set `MEIGEN_AUTO_OPEN=1` in the plugin host environment. Workflow callers otherwise own presentation.

## Commands

These commands belong to the Claude plugin; a bare MCP connection does not install them.

| Command | Description |
|---|---|
| `/meigen:gen <prompt>` | Quick general image generation |
| `/meigen:find <keywords>` | Gallery search and inspiration |
| `/meigen:models` | List available models and switch default |
| `/meigen:setup` | Explain provider configuration |

## Troubleshooting

| Problem | Next step |
|---|---|
| Tools not available | Restart/reconnect. Local: confirm `meigen@3.0.0`. Remote: refresh after backend deployment. npm installation alone does not deploy the APIs. |
| New connection asks for a MeiGen key | Use the remote OAuth connection above and sign in through the host. Do not create a new key. |
| Existing legacy configuration has an invalid/missing key | Restore the existing `MEIGEN_API_TOKEN` in private connection settings, then restart/reconnect. If that key is no longer available, switch to remote OAuth. Keep credentials out of chat. |
| Insufficient credits | API calls only use purchased credits. Top up the same account through [Profile](https://www.meigen.ai/profile) or [mobile Premium](https://www.meigen.ai/m/premium), then ask to continue. Do not poll a rejected request. |
| Image upload failed | Check format, size and source accessibility. Remote MCP cannot read a local path; use actual attachment bytes or a direct image URL. No generation started if upload failed. |
| Tool timeout or host restart | Recover using `check_skill` for Skills or `check_generation` for general generation. Do not submit a new paid attempt automatically. Increase a 60-second host timeout when needed; 240 seconds is a useful Skill-submission setting. |
| Some modules failed | Keep completed images, show failed modules and reported refund states, and avoid automatically replacing the whole batch. |
| Rate limit | Follow the returned wait instruction. Daily request limits are separate from purchased-credit balance. |
| OpenAI-compatible configured but Skill requests a MeiGen key | Skills run on MeiGen Cloud and require purchased credits. |
| Empty search results | Try different keywords or category topics. Search requires the online gallery. |

## OpenClaw distribution

The OpenClaw manifest explicitly declares its MCP server and skills. Some CLI versions load this directory as a Claude-compatible bundle instead; Claude-only commands, agents, hooks and output styles depend on the actual loader and are not promised by the native manifest. The standalone ClawHub Skill is a separate distribution. See the [upgrade guide](../README.md#upgrading) and [direct HTTP API](../SKILLS_API.md).

## Publishing

For maintainers, see [RELEASING.md](../RELEASING.md). `NPM_TOKEN` belongs in the repository's ignored `.env.local` for publishing; it is separate from the customer's `MEIGEN_API_TOKEN` and must not be committed or packaged. npm **3.0.0** is the package version, independent of the MCP protocol date and SDK version.

## License

MIT

Account-library tools are available only through the remote OAuth connection at `https://www.meigen.ai/api/mcp`, after MeiGen sign-in and consent. API keys and local npm cannot access favorites, boards, history or item details. Lists return prompt excerpts; use the remote `get_library_item` tool to read a selected full prompt in Unicode code-point pages (default 8000, maximum 16000). `prompt.length` is the total safe prompt length; `nextOffset=null` marks the final part. Full data appears once in `structuredContent`; text is a short summary.
