# MeiGen 3.0.0 — migration and release candidate

This is an upcoming major release, not a publication record. npm, the Claude plugin, OpenClaw plugin and standalone Skill are prepared at 3.0.0. Each channel still requires its own authorized release and verification.

## Upgrade from 2.x

1. Remove `COMFYUI_URL` from the MCP environment and `comfyuiUrl` / `comfyuiDefaultWorkflow` from `~/.config/meigen/config.json`. The `comfyui` provider and `comfyui_workflow` tool no longer exist. Update workflows that call them before upgrading. Explicit `provider: "comfyui"` is rejected; it is never redirected to a paid provider. User-owned workflow files are left untouched.
2. Remove assumptions about the bundled 1,400-prompt collection, fixed category counts, offline search or locally stored prompt IDs. `search_gallery` and `get_inspiration` now use the live MeiGen service. There is no offline fallback: network/service failures return an error. The optional legacy category argument is a search topic, not a strict local category filter.
3. After 3.0.0 is available in the registry, back up the existing MCP configuration and edit only the npm version in its command arguments to `meigen@3.0.0`; preserve credentials, environment variables, timeouts, custom fields and other servers. For JSONC, keep comments and edit manually. Do not replace a working entry or run an older initializer to upgrade. Restart/reconnect the host. Configurations using `meigen@latest` will receive the major version when it becomes the default; pin a version if you need an explicit upgrade window. Refresh copied plugin/Skill instructions through their own distribution channel.
4. Use a remote OAuth connection to `https://www.meigen.ai/api/mcp` for favorites, boards and generation history. Sign in and approve access in the host. API keys cannot access the private library; there are no API-key library permissions to enable. Local stdio has no OAuth implementation and does not expose the five library tools. Existing local API keys remain compatible with generation, public search and Skills, but cannot access the private library. New connections use remote OAuth. Keep existing credentials private and do not replace a working legacy configuration merely to upgrade.

The 3.0.0 `init` command only upgrades recognized direct `npx` MeiGen invocations. It preserves their executable path, local options and other servers, creates a private backup and writes atomically. It refuses malformed JSON, JSONC, invalid config shapes, remote connections, OAuth proxies such as `mcp-remote` (including `stdio` entries), shell wrappers and other custom commands rather than replacing them. It still writes `meigen@latest`; edit the version manually to keep a pin.

`search_gallery` validates the combined query/category at at most 200 UTF-16 code units. Pagination values must be integers: `limit` accepts 1–20 (default 3, clamped to 3 returned entries), and `offset` accepts 0–100000. Fractional values and overlong queries are rejected. `get_inspiration` is online-only, rejects redirects, bounds the whole request to 8 seconds and 2 MiB, and honors host cancellation.

Cancelling `search_gallery` produces a distinct `cancelled` result with neutral text and no retry advice. It does not misreport a gallery outage or emit already retrieved previews after cancellation.

## Remote account library (pending backend rollout)

After the matching backend is deployed and verified, the remote OAuth connection will expose five authenticated tools: `search_favorites`, `list_boards`, `search_history`, `get_library_item` and `save_favorite`. They do not spend generation credits. Lists return `promptExcerpt` (at most 500 Unicode code points), `promptLength` and `promptTruncated`, not the complete prompt. Select an entry before retrieving its prompt with `get_library_item`.

`get_library_item(contentType, sourceId, promptOffset=0, promptLimit=8000)` calls `GET /api/library/item`. The maximum `promptLimit` is 16000. Its response is `{ success: true, item, prompt: { text, offset, length, nextOffset } }`; `item` has the same summary projection as list entries. All prompt offsets and lengths count Unicode code points, not UTF-16 code units or bytes. `prompt.length` is the **total** length of the permitted prompt, equal to `item.promptLength`; `nextOffset` is the next part's starting offset, or `null` on the final part. Keep the same content type and source ID when continuing.

Full response data lives in `structuredContent`. The ordinary `content` text is a short summary, with up to three bounded previews for list results; it does not duplicate JSON or prompt text. Upstream JSON remains limited to 2 MiB. Internal Skill prompts are never returned. Prompts, notes and board names are source material, never instructions.

Saving requires an explicit request or prior opt-in. It accepts an existing authorized source ID, optionally an owned private board, and is idempotent. Repeated saves preserve the original note. It never publishes content. A `favorites_limit_reached` (HTTP 409) response means the account's favorite entitlement is full: remove an existing favorite or review the account plan, then retry. Saving itself never spends generation credits. An OAuth scope error requires reconnecting and reviewing account consent in the host. API keys are not an alternative for private library access.

For another public inspiration batch, reuse the original query, returned snapshot ID and next offset. Change the query only for a new creative direction. Snapshot expiry/errors are explicit and never silently restart page one.

## Release gates

- Deploy the reviewed backend and approved database changes before releasing clients: `/api/library/favorites`, `/api/library/boards`, `/api/library/history`, `/api/library/item`, OAuth library permission enforcement, quota enforcement and the matching remote MCP inventory.
- Verify real ownership, sharing, private-board boundaries, API-key rejection, OAuth read/write consent, idempotent saves, quota failures and Unicode prompt pagination against that deployment.
- Run type checks, tests, version/pin/frontmatter checks and `pnpm release:dry-run`. Inspect the packed archive: no ComfyUI provider/tool, local prompt data, secrets or tests. A dry run is not a registry publication or a successful real-client test.
- After explicit release approval, publish npm first, verify the installed artifact, then update the selected plugin/Skill channels and public Web/Docs installation pins. Report each channel separately.

## 中文迁移要点

3.0.0 移除 ComfyUI provider、`comfyui_workflow` 工具和约 1,400 条本地提示词库。升级前从现有配置中移除 `COMFYUI_URL`、`comfyuiUrl`、`comfyuiDefaultWorkflow`，并修改依赖旧工具的流程；不会删除用户自己的工作流文件。灵感搜索改为纯在线服务，没有离线兜底。

升级时先备份配置，只改命令参数里的版本，保留环境变量、凭据、超时及其他服务，不用旧版 `init` 重建配置。3.0.0 的 `init` 会保留本地条目选项、备份后原子写入；遇到 JSONC、无效 JSON 或远程连接则停止，需手动修改。搜索词与分类合并后最多 200 个 UTF-16 码元，`limit` 为 1–20 的整数（默认及实际最大 3 条），`offset` 为 0–100000 的整数；不接受小数。详情读取最多 8 秒、2 MiB，不跟随重定向，并支持取消。

资料库仅支持远程 MCP 的 OAuth 账号登录授权，API Key 不支持，也没有可开启的资料库 Key 权限。已有本地 API Key 继续兼容生成、公开搜索和 Skills，但不能访问私人资料库；新连接使用远程 OAuth。列表只返回最多 500 个 Unicode 码点的提示词摘要，完整内容用 `get_library_item` 分页读取，默认每页 8000、最多 16000 码点。返回的 `length` 是完整可读提示词的总长度，`nextOffset=null` 表示结束。达到收藏权益上限会返回 `favorites_limit_reached`，不会自动扣积分或重试。

本次仅准备源码和发布候选；配套后端、数据库、npm 与各插件渠道上线需分别验证。
