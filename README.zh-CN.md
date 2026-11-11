# MeiGen MCP

[English](README.md) · [连接说明](SETUP.zh-CN.md) · [迁移与回退](MIGRATION.md)

搜索灵感、生成图片和视频，并通过 OAuth 使用 MeiGen 收藏、画板、历史与角色。工具、模型参数和业务逻辑统一由远程服务提供。

## 推荐：直接连接远程

在客户端添加 Streamable HTTP MCP：

```text
https://www.meigen.ai/api/mcp
```

使用客户端的 OAuth 登录流程。Claude Code、Cursor、VS Code 和新版 OpenClaw 支持原生远程连接。已有 MeiGen 连接时不要重复添加。新连接无需创建 API Key。

Claude Code / Cursor 示例：

```json
{"mcpServers":{"meigen":{"type":"http","url":"https://www.meigen.ai/api/mcp"}}}
```

VS Code 将同一条目放入 `.vscode/mcp.json` 的 `servers`。用 `list_models`、`list_skills` 验证工具可用；公开查询成功不代表私有权限已授权。收藏等账户工具需要 OAuth 及对应授权。生成仅消耗购买积分，不使用每日免费积分。

## 最后一版 npm 连接桥

**meigen@4.0.0 已发布。** 仍要求 stdio 的客户端可使用：

```json
{"mcpServers":{"meigen":{"command":"npx","args":["-y","meigen@4.0.0"]}}}
```

需要 Node.js 22.19+，推荐 24。新版只负责连接远程服务：新连接走 OAuth；已有 MeiGen API Key 会继续使用，除非显式加 `--oauth`。Key 失效不会自动切换其他 OAuth 账号。固定 Key 不能访问私有收藏或角色。

这是计划中的最后一次 npm 功能更新。之后通常只更新远程端；客户端需要刷新工具列表或重连。协议、安全或传输层修复仍可能需要更新连接桥，不能承诺永久无需维护。

**主版本变更：** BYOK、本地文件处理/自动下载、`gen`、本地偏好和提示词增强留在 **meigen@3.4.0**。固定旧版本的安装不会自动升级；迁移前确认工作流不依赖这些本地能力。旧源码保留在 [v3.4.0](https://github.com/jau123/MeiGen-AI-Design-MCP/tree/v3.4.0)。

公开远程 MCP 与官方 ChatGPT 商店插件是独立渠道，不保证相同的结果卡片或页面；具体展示由客户端支持决定。远程服务不能读取本机路径，请使用支持的上传工具或真实可访问的 URL。中断后保留原 `requestId` 与参数，先查询再恢复，不能盲目新建付费任务。

开发使用 pnpm。发布前检查见 [RELEASING.md](RELEASING.md)。GitHub 源码、npm、各插件包和服务器部署分别验收。
