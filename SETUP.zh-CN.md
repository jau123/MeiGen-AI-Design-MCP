# 连接 MeiGen

推荐在客户端添加 Streamable HTTP 地址 `https://www.meigen.ai/api/mcp`，通过客户端 OAuth 登录。不要在聊天里发送密码、Key 或授权配置。已有相同连接时直接复用；替换旧配置前在本机私下备份。

- Claude Code：`claude mcp add --transport http meigen https://www.meigen.ai/api/mcp`，随后在 `/mcp` 中登录。
- Cursor：在 MCP 设置中添加上述远程地址；JSON 为 `mcpServers.meigen: {"type":"http","url":"https://www.meigen.ai/api/mcp"}`。
- VS Code：同一条目放在 `.vscode/mcp.json` 的 `servers.meigen`。
- OpenClaw：`openclaw mcp add meigen --url https://www.meigen.ai/api/mcp --transport streamable-http --auth oauth --timeout 240`，再执行 `openclaw mcp login meigen`。已有保存条目优先，不要盲目覆盖。

连接后用 `list_models`、`list_skills` 做不收费检查。公开查询成功不证明登录或私有权限；收藏和历史需要额外 OAuth 授权。

## 需要 stdio 的客户端

4.0.0 是待发布候选。**发布后**可使用 `npx -y meigen@4.0.0`；需要 Node.js 22.19+，推荐 24。命令仍是 `meigen` / `meigen-mcp`，实际工具均来自远程。

新连接按提示在浏览器完成 OAuth。固定版本的 `mcp-remote` 管理登录缓存，默认目录 `~/.mcp-auth`，也可设置 `MCP_REMOTE_CONFIG_DIR`。OAuth 传输支持 `HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY`；API Key 通道使用 Node fetch，不保证各 Node 版本都支持代理环境变量。

已有 `MEIGEN_API_TOKEN` 优先于 `~/.config/meigen/config.json` 的 `meigenApiToken`，配置只读不改。Key 失效不会自动切换 OAuth。显式加 `--oauth` 可忽略旧 Key/BYOK 配置，改用账户登录；请核实登录账号后再生成。固定 Key 不支持私有收藏和角色。

仅检测到 BYOK 时会停止并给出迁移说明；不支持自定义 `MEIGEN_BASE_URL`。需要这些能力时保留旧版。不要把第三方供应商任务默默换成消耗 MeiGen 积分的请求。

发布后可用 `npx -y meigen@4.0.0 init cursor`（或 `vscode`、`claude`）添加原生 HTTP 配置。已存在的 stdio/包装命令不自动替换；已有正确远程条目保持原样。添加条目保留其他设置并备份现有文件。JSONC 不自动改写。

远程端不能读取本机路径，也不会自动保存结果。使用真实 HTTPS URL 或工具支持的上传方式，按实时 schema 校验参考文件。生成只消耗购买积分。请求中断后保留原 requestId，先查询任务状态，不要新建付费任务验证连接。

BYOK、本地文件、偏好、提示词增强和 `meigen gen` 留在 **meigen@3.4.0**；参阅[冻结版指南](https://github.com/jau123/MeiGen-AI-Design-MCP/blob/v3.4.0/SETUP.zh-CN.md)与[迁移说明](MIGRATION.md)。
