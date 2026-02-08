<h1 align="center">
  MeiGen-Art — Claude Code & MCP 视觉引擎插件
</h1>

<p align="center">
  <strong>给你的 AI 助手装上视觉引擎。<br>搜索提示词、生成图片、迭代优化 — 全部在对话中完成。</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/meigen"><img src="https://img.shields.io/npm/v/meigen?style=flat-square&color=blue" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/meigen"><img src="https://img.shields.io/npm/dm/meigen?style=flat-square&color=green" alt="npm downloads"></a>
  <img src="https://img.shields.io/badge/Type-MCP_Server-blue?style=flat-square" alt="MCP Server">
  <img src="https://img.shields.io/badge/Local-ComfyUI-green?style=flat-square" alt="ComfyUI Support">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square" alt="MIT"></a>
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

MeiGen-Art 是一个开源的 **MCP Server**（插件），连接你的 AI 助手和专业图片生成工具。可以理解为给 Claude Code 装了一个「显卡驱动」— 装上后，你的 AI 就能搜索视觉参考、增强提示词、直接在终端里生成图片。

**免费功能无需 API Key** — 灵感搜索、提示词增强、模型浏览，装完即用。

### 为什么装这个插件？

<table>
<tr>
<td width="25%" align="center"><strong>本地 GPU 生图</strong><br><sub>接入你的 ComfyUI，用自己的显卡生成 — 免费、私密、完全可控</sub></td>
<td width="25%" align="center"><strong>1,300+ 提示词库</strong><br><sub>像本地版 Lovart 一样搜索精选提示词 — 先找参考再生成</sub></td>
<td width="25%" align="center"><strong>多方案自主产出</strong><br><sub>AI 自动并行生成多套创意方向 — 你只需要选</sub></td>
<td width="25%" align="center"><strong>云端备选</strong><br><sub>没有 GPU？用 MeiGen 云端或你自己的 OpenAI Key 无缝替代</sub></td>
</tr>
</table>

---

## 实际效果

<p align="center">
  <a href="https://qiaowenlong-1317904822.cos.accelerate.myqcloud.com/github/git.mp4">
    <img src="assets/demo-thumbnail.jpg" alt="观看演示" width="600">
  </a>
  <br>
  <sub>▶ 观看：在 Claude Code 中用自然语言生成专业图片</sub>
</p>

### Logo 设计 — 多方案 + 迭代

```
你:   帮我设计一个咖啡品牌 "Dawn Brew" 的 logo

AI:   这里有 4 个创意方向：
      ┌──────────────────────────────────────────────────┐
      │  你想尝试哪个方向？                                │
      │  ☐ 1. 现代极简 — 干净几何，负空间                   │
      │  ☐ 2. 复古徽章 — 怀旧质感，手工艺风                 │
      │  ☐ 3. 手绘风 — 有机线条，匠人温度                   │
      │  ☐ 4. 以上全部                                    │
      └──────────────────────────────────────────────────┘

你:   [选择 1 和 3]

AI:   正在并行生成 2 张图片...
      ✓ 方向 1: 现代极简
        图片 URL: https://images.meigen.art/xxx1.png
        已保存到: ~/Pictures/meigen/2026-02-08_dawn-brew-minimal.png
      ✓ 方向 3: 手绘风
        图片 URL: https://images.meigen.art/xxx2.png
        已保存到: ~/Pictures/meigen/2026-02-08_dawn-brew-handdrawn.png

你:   方向 1 不错，帮我做个马克杯和 T 恤的效果图

AI:   以方向 1 为参考图，正在并行生成 2 个效果图...
      ✓ 马克杯效果图: ~/Pictures/meigen/2026-02-08_dawn-brew-mug.png
      ✓ T 恤效果图: ~/Pictures/meigen/2026-02-08_dawn-brew-tshirt.png
```

### 产品图拍摄 — 简短描述变专业图片

```
你:   拍一张香水瓶的产品图

AI:   描述比较简短，正在补充专业细节...
      已添加：影棚轮廓光、白色大理石台面、柔和散景背景、
      35mm f/2.8 镜头、暖琥珀色调、时尚编辑构图

      ✓ 图片 URL: https://images.meigen.art/xxx3.png
        已保存到: ~/Pictures/meigen/2026-02-08_perfume.png
        (已自动在预览中打开)
```

### 灵感搜索 → 风格参考生图

```
你:   /meigen:find 赛博朋克

AI:   找到 6 条结果：
      1. 霓虹灯街景 — 1.2 万浏览
      2. 带面罩的赛博人物 — 8 千浏览
      3. 未来城市夜景 — 1.5 万浏览
      ...

你:   第 3 个很酷，生一张类似的但加个武士

AI:   以 #3 为风格参考...
      ✓ 图片 URL: https://images.meigen.art/xxx4.png
        已保存到: ~/Pictures/meigen/2026-02-08_cyberpunk-samurai.png
```

---

## 快速开始

### Claude Code 插件（推荐）

```bash
# 添加插件源
/plugin marketplace add jau123/MeiGen-Art

# 安装
/plugin install meigen@meigen-marketplace
```

**安装完成后重启 Claude Code**（关闭再打开，或新建终端标签页）。

#### 首次配置

重启后，免费功能无需配置即可使用 — 试试问：

> "帮我搜索一些创意灵感"

如需解锁图片生成，运行配置向导：

```
/meigen:setup
```

向导会引导你完成：
1. **选择后端** — 本地 ComfyUI、MeiGen 云端、或 OpenAI 兼容 API
2. **输入凭证** — ComfyUI 地址、API Token 或 Key
3. **完成** — 再次重启 Claude Code，即可开始生图

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
| `search_gallery` | 是 | 搜索 1,300+ 精选热门提示词，附带视觉预览 |
| `get_inspiration` | 是 | 获取某条提示词的完整内容、所有图片和元数据 |
| `enhance_prompt` | 是 | 将简短想法转化为专业图片提示词 |
| `list_models` | 是 | 列出所有已配置后端的可用模型 |
| `upload_reference_image` | 是 | 压缩并上传本地图片，用作参考图 |
| `comfyui_workflow` | 是 | 管理 ComfyUI 工作流模板：列表、查看、导入、修改、删除 |
| `generate_image` | 需要 Key | 生成图片 — 自动路由到最佳可用后端 |

### 快捷命令

| 命令 | 说明 |
|------|------|
| `/meigen:gen <提示词>` | 快速生图 — 跳过对话，直接生成 |
| `/meigen:find <关键词>` | 搜索 1,300+ 精选提示词获取灵感 |
| `/meigen:models` | 浏览和切换当前会话的 AI 模型 |
| `/meigen:ref <文件路径>` | 上传本地图片作为参考图，返回 URL |
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

MeiGen-Art 支持三种图片生成后端，可以配置一个或多个 — 系统自动选择最佳可用后端。

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

云端 API，支持多种模型：Nanobanana Pro、GPT image 1.5、Seedream 4.5 等。无需 GPU。

**获取 API Token：**
1. 登录 [meigen.ai](https://www.meigen.ai)
2. 点击头像 → **设置** → **API Keys**
3. 创建新 Key（以 `meigen_sk_` 开头）

```json
{ "meigenApiToken": "meigen_sk_..." }
```

### OpenAI 兼容 API

使用你自己的 API Key 接入 OpenAI（gpt-image-1.5）、Together AI、Fireworks AI 或任何兼容服务。

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

配置向导会引导你选择后端、输入 API Key、导入 ComfyUI 工作流。你也可以直接粘贴 API 提供商文档中的 `curl` 命令 — 自动提取 Key、URL 和模型名。

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
