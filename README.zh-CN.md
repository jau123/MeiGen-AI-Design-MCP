<p align="center">
  <img src="assets/banner.jpg" alt="LibreArt Banner" width="600">
</p>

<h1 align="center">
  LibreArt — AI 视觉创意专家
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

## 为什么选择 LibreArt？

大多数 AI 图片工具，要么是简单的"输入提示词 → 输出图片"的 API，要么是需要专业知识的复杂界面。

LibreArt 走了一条不同的路：它赋予你的 AI 助手**专业的创意能力**——1,300+ 精选热门提示词、风格化的提示词增强技术、多步骤工作流编排——你只需要用自然语言描述想要什么，就能得到专业品质的结果。

**不需要任何提示词工程知识。** 像跟创意总监对话一样，跟你的 AI 助手聊就行了。

---

## 安装

### Claude Code

一行命令，无需 clone 或构建：

```bash
claude mcp add --transport stdio meigen -- npx -y meigen
```

安装时传入 API Key：

```bash
claude mcp add --transport stdio meigen \
  --env MEIGEN_API_TOKEN=meigen_sk_xxx \
  -- npx -y meigen
```

也可以安装后通过交互式向导配置：

```
/meigen:setup
```

### OpenClaw

添加到 `~/.openclaw/openclaw.json`（需要 [MCP adapter](https://github.com/androidStern/openclaw-mcp-adapter)）：

```json
{
  "plugins": {
    "openclaw-mcp-adapter": {
      "servers": {
        "meigen": {
          "transport": "stdio",
          "command": "npx",
          "args": ["-y", "meigen"],
          "env": {
            "MEIGEN_API_TOKEN": "meigen_sk_..."
          }
        }
      }
    }
  }
}
```

### 其他 MCP 兼容客户端

添加到 `.mcp.json` 或对应配置文件：

```json
{
  "mcpServers": {
    "meigen": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "meigen"],
      "env": {
        "MEIGEN_API_TOKEN": "meigen_sk_..."
      }
    }
  }
}
```

> **提示：** 即使没有 API Key，免费功能（灵感搜索、提示词增强、模型列表）也可以直接使用。

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

LibreArt 支持三种图片生成后端，可以配置一个或多个——助手会自动选择最佳可用后端，也可以在每次请求时手动指定。

### MeiGen 平台（推荐）

云端 API，支持多种模型：NanoBanana Pro、Seedream 4.5、Midjourney Niji7 等。包含每日免费额度。

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

使用你自己的 API Key 接入 OpenAI（gpt-image-1）、Together AI、Fireworks AI 或任何 OpenAI 兼容服务。

```json
{
  "openaiApiKey": "sk-...",
  "openaiBaseUrl": "https://api.openai.com",
  "openaiModel": "gpt-image-1"
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
| `OPENAI_MODEL` | 默认模型（默认：`gpt-image-1`） |
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
