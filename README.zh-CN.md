<p align="center">
  <img src="assets/banner.jpg" alt="MeiGen-Art Banner" width="600">
</p>

<h1 align="center">
  MeiGen-Art — AI 视觉创意专家
</h1>

<p align="center">
  <strong>让你的 AI 助手成为图片生成的创意总监</strong><br>
  <sub>适用于 Claude Code、OpenClaw 及任何 MCP 兼容客户端的插件</sub>
</p>

<p align="center">
  <a href="https://www.meigen.ai"><img src="https://img.shields.io/badge/Gallery-meigen.ai-blue?style=flat-square" alt="Gallery"></a>
  <a href="#工具"><img src="https://img.shields.io/badge/Tools-7-green?style=flat-square" alt="7 Tools"></a>
  <a href="#生成后端"><img src="https://img.shields.io/badge/Providers-3-orange?style=flat-square" alt="3 Providers"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square" alt="MIT"></a>
</p>

<p align="center">
  <a href="#安装">安装</a> •
  <a href="#它能做什么">它能做什么</a> •
  <a href="#生成后端">生成后端</a> •
  <a href="#配置">配置</a>
</p>

<p align="center">
  <a href="README.md">English</a> | <strong>中文</strong>
</p>

---

## 为什么选择 MeiGen-Art？

大多数 AI 图片工具，要么是简单的"输入提示词 → 输出图片"的 API，要么是需要专业知识的复杂界面。

MeiGen-Art 走了一条不同的路：它赋予你的 AI 助手**专业的创意能力**——1,300+ 精选热门提示词、风格化的提示词增强技术、多步骤工作流编排——你只需要用自然语言描述想要什么，就能得到专业品质的结果。

**不需要任何提示词工程知识。** 像跟创意总监对话一样，跟你的 AI 助手聊就行了。

---

## 安装

### Claude Code

```bash
# 添加插件源
/plugin marketplace add jau123/MeiGen-Art

# 安装
/plugin install meigen@meigen-marketplace
```

**安装完成后，重启 Claude Code**（关闭再打开，或新建终端标签页）以激活插件。

#### 首次配置

重启后，免费功能无需配置即可使用——试试问：

> "帮我搜索一些创意灵感"

如需解锁图片生成，运行配置向导：

```
/meigen:setup
```

向导会引导你完成：
1. **选择后端** — MeiGen 平台（推荐，支持 Nanobanana Pro / GPT image 1.5 / Seedream 4.5）、本地 ComfyUI、或 OpenAI 兼容 API
2. **输入凭证** — API Token、Key 或 ComfyUI 地址。也可以直接粘贴 `curl` 命令，自动提取配置
3. **完成** — 再次重启 Claude Code，即可开始生成图片

### OpenClaw

我们的技能遵循 [Agent Skills](https://agentskills.io) 开放标准，可复制到 OpenClaw 工作区直接使用。如需 MCP 工具，通过 OpenClaw 的 MCP adapter 连接 MeiGen server 即可。

### 其他 MCP 兼容客户端

添加到 MCP 配置文件（如 `.mcp.json`、`claude_desktop_config.json` 等）：

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

> **提示：** 即使没有 API Key，免费功能（灵感搜索、提示词增强、模型列表）也可以直接使用。通过 `~/.config/meigen/config.json` 或环境变量配置你的后端——详见[配置](#配置)。

---

## 它能做什么

### 1. 探索灵感

> "帮我想想社交媒体发什么图"

当你还没有明确想法时，助手会浏览 1,300+ 精选热门提示词库，展示视觉预览，让你先挑选喜欢的风格，再开始生成。

### 2. 简单想法变专业图片

> "一只猫坐在日式庭院里"

简短的描述会被自动增强为专业提示词——补充光影、构图、镜头、配色等视觉细节——然后直接生成。不需要任何提示词工程知识。

### 3. 批量变体生成

> "设计 4 个不同风格的咖啡品牌 logo"

助手会为每个变体撰写不同的创意方向，最多 4 张并行生成，并附上对比点评。

### 4. 多步骤创意工作流

> "先做一个 logo，然后看看印在马克杯和 T 恤上的效果"

助手会串联生成步骤：先生成基础图片，再将其作为参考图生成产品效果图——在整个系列中保持视觉一致性。

### 5. 参考图风格迁移

> "用这张本地照片的风格来生成新图片"

本地图片会自动压缩上传，返回的 URL 可用于所有三种后端——风格迁移、构图参考或 img2img 工作流。

---

<h2 id="工具">工具</h2>

| 工具 | 免费 | 说明 |
|------|------|------|
| `search_gallery` | 是 | 搜索 1,300+ 精选热门提示词，附带视觉预览 |
| `get_inspiration` | 是 | 获取某条提示词的完整内容、所有图片和元数据 |
| `enhance_prompt` | 是 | 将简短想法转化为专业图片提示词（本地运行） |
| `list_models` | 是 | 列出所有已配置后端的可用模型 |
| `upload_reference_image` | 是 | 压缩并上传本地图片，用作参考图 |
| `comfyui_workflow` | 是 | 管理 ComfyUI 工作流模板：列表、查看、导入、修改、删除 |
| `generate_image` | 需要 Key | 生成图片——自动路由到最佳可用后端 |

---

<h2 id="生成后端">生成后端</h2>

MeiGen-Art 支持三种图片生成后端，可以配置一个或多个——助手会自动选择最佳可用后端，也可以在每次请求时手动指定。

### MeiGen 平台（推荐）

云端 API，支持多种模型：Nanobanana Pro、GPT image 1.5、Seedream 4.5 等。

**获取 API Token：**
1. 登录 [meigen.ai](https://www.meigen.ai)
2. 点击头像 → **设置** → **API Keys**
3. 创建新 Key（以 `meigen_sk_` 开头）

```json
{ "meigenApiToken": "meigen_sk_..." }
```

### ComfyUI（本地）

在自己的 GPU 上运行，完全控制模型、采样器和工作流参数。支持导入任意 ComfyUI API 格式的工作流。

```json
{
  "comfyuiUrl": "http://localhost:8188",
  "comfyuiDefaultWorkflow": "txt2img"
}
```

### OpenAI 兼容 API

使用你自己的 API Key 接入 OpenAI（gpt-image-1.5）、Together AI、Fireworks AI 或任何 OpenAI 兼容服务。

```json
{
  "openaiApiKey": "sk-...",
  "openaiBaseUrl": "https://api.openai.com",
  "openaiModel": "gpt-image-1.5"
}
```

> 三种后端都支持**参考图**。MeiGen 和 OpenAI 直接接受 URL；ComfyUI 会将参考图注入到工作流的 LoadImage 节点中。

---

## 配置

### 交互式配置（推荐）

```
/meigen:setup
```

配置向导会引导你选择后端、输入 API Key、导入 ComfyUI 工作流。你也可以直接粘贴 API 提供商文档中的 `curl` 命令——自动提取 Key、URL 和模型名。

### 配置文件

配置存储在 `~/.config/meigen/config.json`。ComfyUI 工作流存储在 `~/.config/meigen/workflows/`。

### 环境变量

环境变量优先级高于配置文件。

| 变量 | 说明 |
|------|------|
| `MEIGEN_API_TOKEN` | MeiGen 平台 Token |
| `OPENAI_API_KEY` | OpenAI / 兼容 API Key |
| `OPENAI_BASE_URL` | API 地址（默认：`https://api.openai.com`） |
| `OPENAI_MODEL` | 默认模型（默认：`gpt-image-1.5`） |
| `COMFYUI_URL` | ComfyUI 服务地址（默认：`http://localhost:8188`） |

---

## 开发

```bash
npm install        # 安装依赖
npm run build      # 编译 TypeScript → dist/
npm run dev        # 开发模式（tsx）
npm run typecheck  # 类型检查
```

---

## 许可证

MIT
