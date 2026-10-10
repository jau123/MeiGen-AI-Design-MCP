<h1 align="center">MeiGen AI Design MCP</h1>

<p align="center">
  为 AI 助手提供开源视觉工具：搜索灵感，创作图片、视频和商品素材。<br>
  支持 ChatGPT（含 Codex）、Claude Code、Cursor、OpenClaw 及其他 MCP 客户端。
</p>

<p align="center">
  <a href="https://chatgpt.com/plugins/plugin_asdk_app_6ab66d24f56481919361b6c33f7c1928"><img src="https://img.shields.io/badge/ChatGPT_%26_Codex-111111?style=for-the-badge" alt="安装 ChatGPT 与 Codex 插件"></a>
  <a href="#claude-code"><img src="https://img.shields.io/badge/Claude_Code-111111?style=for-the-badge" alt="安装 Claude Code 插件"></a>
  <a href="#remote-mcp"><img src="https://img.shields.io/badge/Cursor-111111?style=for-the-badge" alt="连接 Cursor"></a>
  <a href="#openclaw"><img src="https://img.shields.io/badge/OpenClaw-111111?style=for-the-badge" alt="安装 OpenClaw 插件"></a>
  <a href="#other-clients"><img src="https://img.shields.io/badge/Other_MCP-111111?style=for-the-badge" alt="连接其他 MCP 客户端"></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/meigen"><img src="https://img.shields.io/npm/v/meigen?style=flat-square&color=blue" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square" alt="MIT"></a>
  <a href="https://discord.gg/uX6rnersUx"><img src="https://img.shields.io/badge/Discord-Join-5865F2?style=flat-square&logo=discord&logoColor=white" alt="Discord"></a>
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>中文</strong><br>
  <a href="#快速开始">快速开始</a> · <a href="#skills">功能</a> · <a href="#other-clients">手动配置</a> · <a href="#文档">文档</a>
</p>

## 快速开始

<a id="chatgpt-web"></a>
<a id="codex"></a>

选择你正在使用的 AI 工具：

| 客户端 | 开始使用 |
|---|---|
| **ChatGPT / Codex** | [从 ChatGPT 官方商店安装插件](https://chatgpt.com/plugins/plugin_asdk_app_6ab66d24f56481919361b6c33f7c1928) → 登录 MeiGen → 新建对话并使用 MeiGen，无需 API Key。 |
| **Claude Code** | [安装插件](#claude-code)获得快捷命令和创意助手，也可[连接远程 MCP](#remote-mcp)。 |
| **Cursor** | [添加远程 MCP 地址](#remote-mcp)，然后登录。 |
| **OpenClaw** | [安装 ClawHub 插件](#openclaw)。 |
| **其他 MCP 客户端 / CLI** | 使用[远程 MCP](#remote-mcp)或[本地 npm](#local-npm)。[VS Code、Windsurf、Roo Code、Hermes 配置 →](SETUP.zh-CN.md) |

可以先试试搜索：

> 用 MeiGen 搜索极简产品摄影灵感，给我看看参考图和提示词。

搜索灵感、查询模型和 Skill 不消耗生成积分。MeiGen 云端生成使用账号的**购买积分**，不使用每日免费积分；生成前查询当前价格并确认数量等范围。

<a id="features"></a>
<a id="skills"></a>

## 可以做什么

| 功能 | 试着这样说 |
|---|---|
| 灵感搜索 | “找一些电影感人像参考，展示图片和提示词。” |
| 图片与视频生成 | “先生成一张产品图，再把它变成一段短视频。” |
| 抠图 | “去掉这张图的背景，给我透明 PNG。” |
| 商品详情图 | “为这个商品做一张主图、一张细节图和一张场景图。” |
| 营销海报 | “为周末咖啡品鉴活动设计一张海报。” |
| AI 背景 | “把这个商品放到阳光下的石质台面上。” |
| 图片增强 | “让这张原图更清晰，保留原本的样子。” |

需要原图的任务，请同时提供图片。助手会通过 `list_models` / `list_skills` 查询可用模型、选项和价格，准备素材并返回结果。输入限制与工具调用示例见 [Skill API 指南](SKILLS_API.md)。

### 一个商品，四个方向

<p align="center">
  <img src="assets/sample-luxury.jpg" alt="奢华静物" width="24%">
  <img src="assets/sample-model.jpg" alt="模特展示" width="24%">
  <img src="assets/sample-botanicals.jpg" alt="植物场景" width="24%">
  <img src="assets/sample-minimal.jpg" alt="极简产品摄影" width="24%">
</p>

[在 YouTube 观看演示](https://youtu.be/JQ3DZ1DXqvs)。

<a id="other-clients"></a>

## 手动配置 MCP

| 方式 | 适合场景 |
|---|---|
| **远程 MCP** | 在 Claude Code、Cursor 等兼容 HTTP 的客户端使用 MeiGen 云端，无需本地安装。 |
| **本地 npm** | 自动准备和保存本地文件，使用 ComfyUI、OpenAI 兼容生图 API 或独立 CLI。 |
| **客户端插件** | 为 Claude Code 或 OpenClaw 安装配套连接与创意助手。 |

每个客户端保留一套 MeiGen 连接，避免工具重复。五项视觉 Skills 和视频生成均使用 MeiGen 云端；ComfyUI 与 OpenAI 兼容供应商用于本地普通生图。

<a id="remote-mcp"></a>

### 远程 MCP

在客户端 MCP 设置中添加以下 **Streamable HTTP** 地址，选择 **Connect / Authenticate**，然后登录 MeiGen：

```text
https://www.meigen.ai/api/mcp
```

OAuth 登录需要客户端支持；不可用时可[私密配置 API Key](SETUP.zh-CN.md#authentication)。重新连接后，让助手“列出 MeiGen 可用的 Skills 和当前价格”，即可在不生成的情况下验证连接。

需要手动配置 Codex CLI / IDE 的 MCP 时，可查看[进阶配置指南](SETUP.zh-CN.md#codex-manual)。

<a id="local-npm"></a>

### 本地 npm

建议使用 Node.js 22+。在客户端 MCP 配置中添加：

```json
{
  "mcpServers": {
    "meigen": {
      "command": "npx",
      "args": ["-y", "meigen@2.0.2"]
    }
  }
}
```

需要 MeiGen 云端生成时，在 [API Keys](https://www.meigen.ai/profile/api-keys) 创建私密 Key，通过服务的启动环境传入 `MEIGEN_API_TOKEN`。不要把 Key 放进聊天或提交到仓库。[各客户端配置、生成后端与 CLI →](SETUP.zh-CN.md)

<a id="claude-code"></a>

<details>
<summary><strong>Claude Code 插件</strong></summary>

在 Claude Code 中执行，安装后重启：

```text
/plugin marketplace add jau123/MeiGen-AI-Design-MCP
/plugin install meigen@meigen-marketplace
```

使用 `/meigen:setup` 配置生成后端。插件提供 `/meigen:gen`、`/meigen:find`、`/meigen:models` 和可选创意 Agent。[插件指南 →](plugin/README.md)

</details>

<a id="openclaw"></a>

<details>
<summary><strong>OpenClaw</strong></summary>

从 [ClawHub 安装完整插件](https://clawhub.ai/plugins/meigen-ai-design)：

```bash
openclaw plugins install clawhub:meigen-ai-design
```

仅需独立 Skill 时，使用 `npx clawhub@latest install creative-toolkit`。[配置与排错 →](SETUP.zh-CN.md)

</details>

<a id="install-with-ai"></a>

<details>
<summary><strong>让编程助手帮你配置 MCP</strong></summary>

将下面这段发给能够配置 MCP 客户端的 AI 助手：

```text
请参考 https://github.com/jau123/MeiGen-AI-Design-MCP#quick-start 配置 MeiGen MCP。
识别当前客户端，保留其他服务，复用已有的 MeiGen 连接。
优先使用远程 HTTP 和 OAuth；需要本地文件或 ComfyUI 时使用本地 npm。
让我自行登录或私密输入凭据，不要在聊天里索要 Key。
重连后调用 list_skills 验证，不上传、不生成、不消耗积分。
如果无法配置当前客户端，请说明还需要手动完成的步骤。
```

</details>

<a id="upgrading"></a>

## 文档

- [客户端配置、隐私与常见问题](SETUP.zh-CN.md) · [升级说明](SETUP.zh-CN.md#upgrading)
- [五项 Skills HTTP API 与 MCP 调用示例](SKILLS_API.md)
- [编排图片／视频步骤与恢复中断任务](COMPOSABLE_WORKFLOWS.zh-CN.md)
- [Claude Code 插件命令与 Agent](plugin/README.md)
- [版本说明](RELEASE_NOTES_2.0.2.md) · [维护者发布指南](RELEASING.md)

生成中断时，先通过 `check_generation` 或 `check_skill` 查询原任务，再决定是否重新付费生成。请保留原始素材，并下载需要长期保存的结果。

## 社区与许可

[Discord](https://discord.gg/uX6rnersUx) · [问题反馈](https://github.com/jau123/MeiGen-AI-Design-MCP/issues) · [MeiGen](https://www.meigen.ai) · [隐私政策](https://www.meigen.ai/privacy-policy-zh)

本地提示词库包含来自 [nanobanana-trending-prompts](https://github.com/jau123/nanobanana-trending-prompts) 的 1,446 条精选提示词。项目已被 [Awesome MCP Servers](https://github.com/punkpeye/awesome-mcp-servers) 和 [wshobson/agents](https://github.com/wshobson/agents/tree/main/plugins/meigen-ai-design) 收录。

[MIT](LICENSE)。开源服务可免费使用；云端生成及第三方供应商按各自规则计费。
