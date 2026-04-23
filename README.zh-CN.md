<h1 align="center">
  MeiGen AI Design MCP <a href="https://github.com/punkpeye/awesome-mcp-servers"><img src="https://awesome.re/mentioned-badge.svg" alt="Mentioned in Awesome MCP Servers"></a> <a href="https://github.com/wshobson/agents/tree/main/plugins/meigen-ai-design"><img src="https://img.shields.io/badge/wshobson%2Fagents-Featured-blue?style=flat&logo=github" alt="Featured in wshobson/agents"></a>
</h1>

<p align="center">
  <strong>让 Claude Code / OpenClaw 变成媲美 Lovart 的私人设计助理</strong><br><sub>支持本地 ComfyUI 生图和接入 API，1,300+ 专业提示词库，多方案并行</sub>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/meigen"><img src="https://img.shields.io/npm/v/meigen?style=flat-square&color=blue" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/meigen"><img src="https://img.shields.io/npm/dm/meigen?style=flat-square&color=green" alt="npm downloads"></a>
  <img src="https://img.shields.io/badge/Type-MCP_Server-blue?style=flat-square" alt="MCP Server">
  <img src="https://img.shields.io/badge/Local-ComfyUI-green?style=flat-square" alt="ComfyUI Support">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square" alt="MIT"></a>
  <a href="https://discord.gg/uX6rnersUx"><img src="https://img.shields.io/badge/Discord-Join-5865F2?style=flat-square&logo=discord&logoColor=white" alt="Discord"></a>
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> &bull;
  <a href="#实际效果">演示</a> &bull;
  <a href="#功能一览">功能</a> &bull;
  <a href="#生成后端">后端</a> &bull;
  <a href="#快捷命令">命令</a>
</p>

<p align="center">
  <a href="README.md">English</a> | <strong>中文</strong>
</p>

---

## 这是什么？

一个开源 MCP Server（通过插件市场安装），通过 8 个 tools 和精心设计的 skills，让 LLM 具备创意和审美能力，可以完成更复杂的设计任务。它能让 LLM 了解各种生图模型的使用技巧，通过参考图和多方案并行，交付更专业的成果。

- 可以调用本地 ComfyUI 服务，不依赖外部 API；也可以方便地接入任意自定义 API
- 内置 1,500+ 优质提示词模板（来自 [nanobanana-trending-prompts](https://github.com/jau123/nanobanana-trending-prompts)）和精心调试的提示词撰写技巧，把需求转化为具象的生图任务
- 支持并行批量任务和子 Agent 调用，避免主窗口上下文膨胀

---

## 实际效果

<p align="center">
  <a href="https://youtu.be/JQ3DZ1DXqvs">
    <img src="https://img.youtube.com/vi/JQ3DZ1DXqvs/maxresdefault.jpg" alt="观看演示" width="400">
  </a>
  <br>
  <b><a href="https://youtu.be/JQ3DZ1DXqvs">▶ 在 YouTube 观看演示</a></b>
</p>

### 产品图 — 4 个方向并行生成

> *"帮这瓶香水做 4 张产品展示图，其中一张要有模特。"*

**过程** — AI 自动上传参考图、规划 4 个创意方向、撰写专业提示词：

<p align="center">
  <img src="assets/demo-process-zh.jpg" alt="并行生成过程" width="700">
</p>

**结果** — 不到 2 分钟，4 个方向全部完成：

<p align="center">
  <img src="assets/demo-result-zh.jpg" alt="生成结果" width="700">
</p>

**生成的图片：**

<p align="center">
  <img src="assets/sample-luxury.jpg" alt="奢华静物" width="24%">
  <img src="assets/sample-model.jpg" alt="优雅模特" width="24%">
  <img src="assets/sample-botanicals.jpg" alt="梦幻花境" width="24%">
  <img src="assets/sample-minimal.jpg" alt="极简光影" width="24%">
</p>

---

## 快速开始

### Claude Code 插件（推荐）

```bash
# 添加插件源
/plugin marketplace add jau123/MeiGen-AI-Design-MCP

# 安装
/plugin install meigen@meigen-marketplace
```

**安装完成后重启 Claude Code**（关闭再打开，或新建终端标签页）。

**其他插件市场** — 也可通过 [wshobson/agents](https://github.com/wshobson/agents)（30k+ stars）安装：

```bash
/plugin marketplace add wshobson/agents
/plugin install meigen-ai-design@claude-code-workflows
```

> 该市场不包含 MCP 服务配置。安装后需手动添加到项目 `.mcp.json`：
> ```json
> { "mcpServers": { "meigen": { "command": "npx", "args": ["-y", "meigen@1.2.7"] } } }
> ```

#### 首次配置

重启后，免费功能无需配置即可使用 — 试试问：

> "帮我搜索一些创意灵感"

如需解锁图片生成，运行配置向导：

```
/meigen:setup
```

向导会引导你完成：
1. **选择后端** — 本地 ComfyUI、MeiGen 云端、或任意 OpenAI 兼容 API（自带 Key 和端点）
2. **输入凭证** — ComfyUI 地址、API Token 或 Key
3. **完成** — 再次重启 Claude Code，即可开始生图

### Cursor / VS Code / Windsurf / Roo Code

一行命令为任意支持的 AI 编程工具配置 MeiGen：

```bash
npx meigen init cursor      # Cursor
npx meigen init vscode      # VS Code / GitHub Copilot
npx meigen init windsurf    # Windsurf
npx meigen init roo         # Roo Code
npx meigen init claude      # Claude Code（项目级）
```

自动写入正确格式的 MCP 配置文件。如果配置文件已存在，MeiGen 会合并写入，不会覆盖你的其他 MCP 服务。

### OpenClaw

从 [ClawHub](https://clawhub.ai/plugins/meigen-ai-design) 安装完整插件（包含命令、技能和 MCP 服务）：

```bash
openclaw bundles install clawhub:meigen-ai-design
```

或仅安装技能（不含命令/agents）：

```bash
npx clawhub@latest install creative-toolkit
```

### 其他 MCP 兼容客户端

添加到 MCP 配置文件（如 `.mcp.json`、`claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "meigen": {
      "command": "npx",
      "args": ["-y", "meigen@latest"],
      "env": {
        "MEIGEN_API_TOKEN": "meigen_sk_..."
      }
    }
  }
}
```

> 即使没有 API Key，免费功能（灵感搜索、提示词增强、模型列表）也可以直接使用。

---

<h2 id="功能一览">功能一览</h2>

### MCP 工具

| 工具 | 免费 | 说明 |
|------|------|------|
| `search_gallery` | 是 | 搜索 1,500+ 精选热门提示词，附带视觉预览（数据来自 [nanobanana-trending-prompts](https://github.com/jau123/nanobanana-trending-prompts)） |
| `get_inspiration` | 是 | 获取某条提示词的完整内容、所有图片和元数据 |
| `enhance_prompt` | 是 | 将简短想法转化为专业图片提示词 |
| `list_models` | 是 | 列出所有已配置后端的可用模型 |
| `comfyui_workflow` | 是 | 管理 ComfyUI 工作流模板：列表、查看、导入、修改、删除 |
| `manage_preferences` | 是 | 记住你偏好的风格、比例、模型和收藏的提示词 |
| `generate_image` | 需要 Key | 生成图片 — 自动路由到最佳可用后端。本地参考图自动压缩上传。 |

### 快捷命令

| 命令 | 说明 |
|------|------|
| `/meigen:gen <提示词>` | 快速生图 — 跳过对话，直接生成 |
| `/meigen:find <关键词>` | 搜索 1,300+ 精选提示词获取灵感 |
| `/meigen:models` | 浏览和切换当前会话的 AI 模型 |
| `/meigen:setup` | 交互式后端配置向导 |

### 智能 Agent

MeiGen 使用专用子 Agent 实现高效并行执行：

| Agent | 用途 |
|-------|------|
| `image-generator` | 在隔离上下文中执行 `generate_image` — 支持真正的并行生成 |
| `prompt-crafter` | 为批量生成撰写多个不同风格的提示词（使用 Haiku 模型，更节省成本） |
| `gallery-researcher` | 深度灵感搜索，不会占用主对话的上下文（使用 Haiku 模型） |

### 输出风格

通过 `/output-style` 切换创意模式：

- **Creative Director** — 创意总监模式，以视觉叙事、情绪板和设计思维组织回复
- **Minimal** — 极简模式，只输出图片和文件路径，无多余解释。适合批量工作流

### 自动化 Hook

- **配置检查** — 会话启动时自动验证后端配置，缺失时引导完成设置
- **自动打开** — 生成的图片自动在预览中打开（macOS）

---

<h2 id="生成后端">生成后端</h2>

MeiGen MCP 支持三种图片生成后端，可以配置一个或多个 — 系统自动选择最佳可用后端。

### ComfyUI — 本地免费

在自己的 GPU 上运行，完全控制模型、采样器和工作流参数。支持导入任意 ComfyUI API 格式的工作流 — MeiGen 自动检测 KSampler、CLIPTextEncode、EmptyLatentImage、LoadImage 节点。

```json
{
  "comfyuiUrl": "http://localhost:8188",
  "comfyuiDefaultWorkflow": "txt2img"
}
```

> 适合 Flux、SDXL 或任何你本地运行的模型。图片完全不离开你的机器。

### MeiGen 云端

云端 API，支持多种模型：GPT Image 2.0、Nanobanana 2、Seedream 5.0 等。无需 GPU。

**获取 API Token：**
1. 登录 [meigen.ai](https://www.meigen.ai)
2. 点击头像 → **设置** → **API Keys**
3. 创建新 Key（以 `meigen_sk_` 开头）

```json
{ "meigenApiToken": "meigen_sk_..." }
```

**GPT Image 2.0 分辨率与质量** — 默认模型支持两个可选的 `generate_image` 参数：

- `resolution`：`"1K"`（默认）/ `"2K"` / `"4K"` — 海报、印刷、大屏壁纸时升级
- `quality`：`"low"` / `"medium"`（默认）— 快速草图、缩略图可用 `"low"` 省积分

价格：1K/low ≈ 2 积分，**1K/medium = 10 积分（默认）**，2K/medium ≈ 25，4K/medium ≈ 40。运行 `list_models` 可查看各模型实际支持的档位。

### 自带 API（OpenAI 兼容）

接入**任意**符合 OpenAI 接口规范的生图 API — Together AI、Fireworks AI、DeepInfra、硅基流动，或你自己的端点。只需提供 Key、请求地址和模型名：

```json
{
  "openaiApiKey": "sk-...",
  "openaiBaseUrl": "https://api.together.xyz/v1",
  "openaiModel": "black-forest-labs/FLUX.1-schnell"
}
```

> 三种后端都支持**参考图**。MeiGen 和 OpenAI 兼容 API 接受 URL；ComfyUI 同时支持 URL 和本地文件路径，会将参考图注入到工作流的 LoadImage 节点中。

---

## 配置

### 交互式配置（推荐）

```
/meigen:setup
```

配置向导会引导你选择后端、输入 API Key、导入 ComfyUI 工作流。你也可以直接粘贴 API 提供商文档中的 `curl` 命令 — 自动提取 Key、URL 和模型名。

### 配置文件

配置存储在 `~/.config/meigen/config.json`。ComfyUI 工作流存储在 `~/.config/meigen/workflows/`。

### 环境变量

环境变量优先级高于配置文件。

| 变量 | 说明 |
|------|------|
| `MEIGEN_API_TOKEN` | MeiGen 平台 Token |
| `OPENAI_API_KEY` | 你的 API Key（任意 OpenAI 兼容供应商） |
| `OPENAI_BASE_URL` | API 地址 — 修改此项以接入 Together AI、Fireworks AI 等 |
| `OPENAI_MODEL` | 端点支持的模型 ID |
| `COMFYUI_URL` | ComfyUI 服务地址（默认：`http://localhost:8188`） |

---

## 隐私

MeiGen MCP 尊重你的隐私。以下是数据处理方式：

- **ComfyUI（本地）** — 所有处理在本机完成，不发送任何数据到外部。
- **MeiGen 云端** — 提示词和参考图会发送到 `api.meigen.ai` 进行生成。生成的图片临时存储在 Cloudflare R2。详见 [meigen.ai/privacy](https://www.meigen.ai/privacy)。
- **OpenAI 兼容 API** — 提示词和参考图会发送到你配置的 API 端点。请参考你的服务商隐私政策。
- **参考图上传** — 图片在本地压缩（最大 2MB）后上传到 Cloudflare R2（通过 `gen.meigen.ai`），无需认证。
- **灵感搜索和提示词增强** — 在本地使用内置数据运行，不调用外部 API。

不包含任何遥测、分析或追踪功能。

---

## 许可证

[MIT](LICENSE) — 个人和商业用途均免费。
