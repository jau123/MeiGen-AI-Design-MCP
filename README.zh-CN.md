<h1 align="center">MeiGen AI Design MCP</h1>


<p align="center">
  发现灵感，使用最新 AI 模型创建图片和视频。<br>
  为 ChatGPT、Claude、Cursor、OpenClaw 及其他 AI 助手提供开源 MCP 工具。
</p>

<p align="center">
  <a href="https://chatgpt.com/plugins/plugin_asdk_app_6ab66d24f56481919361b6c33f7c1928"><img src="https://img.shields.io/badge/ChatGPT-111111?style=for-the-badge" alt="安装 ChatGPT 插件"></a>
  <a href="#remote-mcp"><img src="https://img.shields.io/badge/Claude-111111?style=for-the-badge" alt="连接 Claude"></a>
  <a href="#remote-mcp"><img src="https://img.shields.io/badge/Cursor-111111?style=for-the-badge" alt="连接 Cursor"></a>
  <a href="#openclaw"><img src="https://img.shields.io/badge/OpenClaw-111111?style=for-the-badge" alt="连接 OpenClaw"></a>
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
| **ChatGPT** | [从 ChatGPT 官方商店安装插件](https://chatgpt.com/plugins/plugin_asdk_app_6ab66d24f56481919361b6c33f7c1928) → 登录 MeiGen → 新建对话并使用 MeiGen，无需 API Key。 |
| **Claude** | [连接远程 OAuth](#remote-mcp)并登录，另有可选[创意助手](#claude-code)。 |
| **Cursor** | [添加远程 MCP 地址](#remote-mcp)，然后登录。 |
| **OpenClaw** | [从 ClawHub 安装](#openclaw)，再通过 OAuth 登录。 |
| **其他 MCP 客户端** | [连接远程 OAuth](#remote-mcp)。[配置指南 →](SETUP.zh-CN.md) |

可以先试试搜索：

> 用 MeiGen 搜索极简产品摄影灵感，给我看看参考图和提示词。

想看更多选择？通过远程 MCP，可以让助手按同一方向再找一批，或描述新的创作方向。

搜索灵感、查询模型和 Skill 不消耗生成积分。MeiGen 云端生成使用账号的**购买积分**，不使用每日免费积分；生成前查询当前价格并确认数量等范围。

<a id="features"></a>
<a id="skills"></a>

## 可以做什么

| 功能 | 试着这样说 |
|---|---|
| 灵感搜索 | “找一些电影感人像参考，展示图片和提示词。” |
| 图片与视频生成 | “先生成一张产品图，再把它变成一段短视频。” |
| 参考素材 | “用这段视频或音频作为兼容视频模型的创作参考。” |
| 已有角色 — 远程 OAuth | “列出我在 MeiGen 保存的角色，用这个角色生成视频。” |
| 私人资料库 — 远程 OAuth | “找出我收藏的参考图，或以前某张作品用的提示词。” |
| 抠图 | “去掉这张图的背景，给我透明 PNG。” |
| 商品详情图 | “为这个商品做一张主图、一张细节图和一张场景图。” |
| 营销海报 | “为周末咖啡品鉴活动设计一张海报。” |
| AI 背景 | “把这个商品放到阳光下的石质台面上。” |
| 图片增强 | “让这张原图更清晰，保留原本的样子。” |

需要原图的任务，请同时提供图片。助手会通过 `list_models` / `list_skills` 查询可用模型、选项和价格，准备素材并返回结果。输入限制与工具调用示例见 [Skill API 指南](SKILLS_API.md)。

视频参考遵循各模型的首尾帧、内容参考图、视频和音频能力。素材准备不扣生成积分，需要购买积分余额大于零；生成的公开临时链接七天后清理。已有角色可通过 OAuth 读取和使用，暂不支持创建角色。详见 [3.1 发布说明](RELEASE_NOTES_3.1.0.md)。

### 把 MeiGen 里的收藏带入对话

先在 MeiGen 浏览、收藏灵感，再让助手继续创作。通过[远程 OAuth](#remote-mcp)连接，助手可以查询收藏、浏览画板、查找历史作品并读取选中的原始提示词。涉及喜好或风格时，也可以从相关收藏中寻找参考。

你可以要求收藏某条灵感或自己的生成结果，也可以指定私密画板。保存需要明确要求或事先授权，不会公开发布作品，也不消耗生成积分。读取与保存分别授权；已有连接可能需要补充同意新权限。

**远程 OAuth 与 ChatGPT 官方插件均已开放。** 本地 npm 和 API Key 不能访问私人资料库。请刷新客户端工具列表，并完成提示的增量授权。工具名称与提示词分页细节见[资料库参考](RELEASE_NOTES_3.0.0.md#remote-account-library)。

<a id="other-clients"></a>

## 手动配置 MCP

新连接使用远程 OAuth，每个客户端保留一套 MeiGen 连接，避免工具重复。下方本地 npm 和可选客户端插件适用于已有 API Key 集成及 OpenAI 兼容生图服务。

<a id="remote-mcp"></a>

### 远程 MCP

在客户端 MCP 设置中添加以下 **Streamable HTTP** 地址，选择 **Connect / Authenticate**，然后登录 MeiGen：

```text
https://www.meigen.ai/api/mcp
```

OAuth 登录需要客户端支持；不支持时请使用兼容的客户端或 ChatGPT 官方插件，不以创建新 API Key 替代账号登录。重新连接后，让助手“列出 MeiGen 可用的 Skills 和当前价格”，即可在不生成的情况下验证连接。

需要手动配置 Codex CLI / IDE 的 MCP 时，可查看[进阶配置指南](SETUP.zh-CN.md#codex-manual)。

<a id="local-npm"></a>

### 本地 npm — 旧版兼容与 BYOK

仅已有本地集成与 BYOK 使用此 stdio 配置；新用户连接远程 OAuth。建议使用 Node.js 22+：

```json
{
  "mcpServers": {
    "meigen": {
      "command": "npx",
      "args": ["-y", "meigen@3.1.1"]
    }
  }
}
```

已有本地 API Key 继续兼容生成、公开搜索和 Skills，但不能访问私人资料库；新连接使用远程 OAuth。旧版集成保留私密环境中的原 `MEIGEN_API_TOKEN`；本地 npm 不支持 OAuth。[各客户端配置、生成后端与 CLI →](SETUP.zh-CN.md)

**从 2.x 升级？** [3.0.0 已在 npm 发布](https://www.npmjs.com/package/meigen/v/3.0.0)，移除了 ComfyUI 与内置离线提示词库。请阅读[迁移说明](RELEASE_NOTES_3.0.0.md)，升级时保留已有凭据与配置。OpenAI 兼容供应商仅用于普通生图，视频和五项视觉 Skills 使用 MeiGen 云端。

<a id="claude-code"></a>

<details>
<summary><strong>Claude 插件</strong></summary>

新用户优先连接远程 OAuth。以下可选插件仍内置旧版 stdio，切换时保留一套有效连接。在 Claude 中执行，安装后重启：

```text
/plugin marketplace add jau123/MeiGen-AI-Design-MCP
/plugin install meigen@meigen-marketplace
```

使用 `/meigen:setup` 配置生成后端。插件提供 `/meigen:gen`、`/meigen:find`、`/meigen:models` 和可选创意 Agent。[插件指南 →](plugin/README.md)

</details>

<a id="openclaw"></a>

<details>
<summary><strong>OpenClaw</strong></summary>

在新版 OpenClaw 中安装 [ClawHub 的 MeiGen 插件](https://clawhub.ai/plugins/meigen-ai-design)，再通过 OAuth 连接账号：

```bash
openclaw plugins install clawhub:meigen-ai-design
# 仅用于新连接；已有 meigen 条目请保留并先检查
openclaw mcp add meigen --url https://www.meigen.ai/api/mcp --transport streamable-http --auth oauth --timeout 240
openclaw mcp login meigen
```

4.1 插件包含创作指引和远程工具，以及仅限 OAuth 的收藏、画板与历史记录。独立 `creative-toolkit` Skill 只提供指引，安装插件后无需再装。[安装及旧版 3.x 迁移 →](SETUP.zh-CN.md#openclaw)

</details>

<a id="install-with-ai"></a>

<details>
<summary><strong>让编程助手帮你配置 MCP</strong></summary>

将下面这段发给能够配置 MCP 客户端的 AI 助手：

```text
请参考 https://github.com/jau123/MeiGen-AI-Design-MCP#quick-start 配置 MeiGen MCP。
识别当前客户端，保留其他服务，复用已有的 MeiGen 连接。
MeiGen 账号访问使用远程 HTTP 和 OAuth；仅在需要时保留已有旧版 API Key 或 BYOK 连接，不创建新 MeiGen Key。
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
- [Claude 插件命令与 Agent](plugin/README.md)
- [3.0 迁移说明](RELEASE_NOTES_3.0.0.md) · [维护者发布指南](RELEASING.md)

生成中断时，先通过 `check_generation` 或 `check_skill` 查询原任务，再决定是否重新付费生成。请保留原始素材，并下载需要长期保存的结果。

## 社区与许可

[Discord](https://discord.gg/uX6rnersUx) · [问题反馈](https://github.com/jau123/MeiGen-AI-Design-MCP/issues) · [MeiGen](https://www.meigen.ai) · [隐私政策](https://www.meigen.ai/privacy-policy-zh)

项目已被 [Awesome MCP Servers](https://github.com/punkpeye/awesome-mcp-servers) 和 [wshobson/agents](https://github.com/wshobson/agents/tree/main/plugins/meigen-ai-design) 收录。

[MIT](LICENSE)。开源服务可免费使用；云端生成及第三方供应商按各自规则计费。
