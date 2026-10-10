# MCP 客户端配置

[返回首页](README.zh-CN.md) · [English](SETUP.md)

ChatGPT 和 Codex 用户可[从 ChatGPT 官方商店安装 MeiGen](https://chatgpt.com/plugins/plugin_asdk_app_6ab66d24f56481919361b6c33f7c1928)并登录。本页面向需要手动连接 MCP、运行本地服务或集成工作流的开发者。

<a id="authentication"></a>

## 账号与认证

远程地址：`https://www.meigen.ai/api/mcp`（Streamable HTTP）。支持 OAuth 的客户端可选择 Connect / Authenticate，在浏览器中登录 MeiGen 并授权；具体兼容性见[远程接入指南](https://docs.meigen.ai/en/mcp/remote)。

无法使用 OAuth 时，在桌面浏览器打开 [API Keys](https://www.meigen.ai/profile/api-keys)，创建私密 Key。远程连接设置 `Authorization: Bearer <MeiGen API key>`；本地进程设置 `MEIGEN_API_TOKEN`。不要同时配置固定 Key 和 OAuth，不要把凭据放进聊天、URL 或仓库。

公开灵感、模型和 Skill 查询不消耗生成积分；云端生成使用购买积分，不使用每日免费积分。使用 `list_models` / `list_skills` 查询当前选项与价格。可在[已连接的应用](https://www.meigen.ai/oauth/connections)撤销 OAuth 授权。

## 客户端配置

本地示例固定使用 `meigen@2.0.2`，建议 Node.js 22+。修改配置后重连；调用 `list_skills` 验证实际工具连接，不需要付费生成。

<a id="codex-manual"></a>

### Codex 手动 MCP 配置（可选）

仅在需要手动控制 MCP 配置、使用本地 npm 工具，或使用尚不支持插件的 IDE 扩展时，参考下列设置。同一主机上的 Codex 客户端共享 MCP 配置。参见 [Codex 官方 MCP 指南](https://developers.openai.com/codex/mcp)。

**远程连接——使用 MeiGen 云端与 Skills 时推荐：**

```bash
codex mcp add meigen --url https://www.meigen.ai/api/mcp
codex mcp login meigen
```

已有条目切换 OAuth 时，移除固定 Authorization 请求头或 `bearer_token_env_var`，保留其他服务。较长 Skill 可在原条目设置 `tool_timeout_sec = 240`。通用 OAuth 需服务端完成开放且客户端版本兼容。

**API Key 兼容方式：** 改用 `--bearer-token-env-var MEIGEN_API_TOKEN`，并在启动 Codex 的环境中设置变量，不再执行 OAuth 登录。项目 `.env.local` 不会自动加载；桌面客户端无法继承环境变量时，可用私密请求头设置。不要把 Key 放进聊天或共享文件。

**本地连接——需要自动处理本地图片、ComfyUI 或本地专属工具时：**用下面这段**替换**远程条目。建议使用 Node.js 22 或更高版本。

```toml
[mcp_servers.meigen]
command = "npx"
args = ["-y", "meigen@2.0.2"]
env_vars = ["MEIGEN_API_TOKEN"]
startup_timeout_sec = 90
tool_timeout_sec = 240
```

它会把本地配置的 `MEIGEN_API_TOKEN` 传给 npm 进程。也可先执行 `codex mcp add meigen -- npx -y meigen@2.0.2` 注册本地命令，再补上上述环境变量传递和超时设置。`meigen init codex` 尚不支持，请使用 Codex 自身的 MCP 配置方式。

配置后重启或重新连接。在 Codex CLI 中，`codex mcp list` 可检查注册信息，`/mcp` 可查看连接状态。然后说 **“列出 MeiGen 可用的 Skills 和当前价格”**，验证一次真实工具调用，不生成图片、不扣点。仅保存配置不代表已经连接成功。较长的视频任务可能需要更长的工具超时。

### Cursor / VS Code / Windsurf / Roo Code

一行命令为任意支持的 AI 编程工具配置 MeiGen：

```bash
npx -y meigen@2.0.2 init cursor      # Cursor
npx -y meigen@2.0.2 init vscode      # VS Code / GitHub Copilot
npx -y meigen@2.0.2 init windsurf    # Windsurf
npx -y meigen@2.0.2 init roo         # Roo Code
npx -y meigen@2.0.2 init claude      # Claude Code（项目级）
```

自动写入正确格式的 MCP 配置文件。如果配置文件已存在，MeiGen 会合并写入，不会覆盖你的其他 MCP 服务。

`init` 生成的配置跟随 npm 默认发布标签自动更新；上面的手写示例则固定在 2.0.2。需要固定版本时，把生成配置中的 `args` 改为 `["-y", "meigen@2.0.2"]`，再重启客户端。

<a id="openclaw"></a>

### OpenClaw

从 [ClawHub](https://clawhub.ai/plugins/meigen-ai-design) 安装完整插件（包含技能与显式 MCP 连接；其他扩展取决于客户端加载方式）：

```bash
openclaw plugins install clawhub:meigen-ai-design
```

或仅安装技能（不含命令/agents）：

```bash
npx clawhub@latest install creative-toolkit
```

### CLI 模式(不需要 MCP 宿主)

如果你想在 shell 脚本、CI 流水线或终端中直接用 AI 生图,MeiGen 同一个 npm 包里自带一个 `gen` 命令。

```bash
# 在本地设置 token（桌面浏览器访问 https://www.meigen.ai/profile/api-keys 创建）
export MEIGEN_API_TOKEN=meigen_sk_...

# 生图
npx -y meigen@2.0.2 gen --prompt "阳光厨房里的三花猫"

# 指定模型 + 比例
npx -y meigen@2.0.2 gen -p "科技 logo" -m midjourney-v8.1 -r 1:1

# 带参考图(本地路径自动上传)
npx -y meigen@2.0.2 gen -p "产品 hero shot" --ref ~/Desktop/bottle.jpg

# 只提交不等待 — 输出 generationId(适合 CI)
npx -y meigen@2.0.2 gen -p "..." --no-wait

# JSON 输出(适合 jq 管道)
npx -y meigen@2.0.2 gen -p "..." --json | jq -r '.imageUrls[0]'
```

CLI 生成的图像保存到 `~/Pictures/meigen/`（可用 `MEIGEN_OUTPUT_DIR` 覆盖）。五项 Skills 返回结果链接，由宿主预览或下载。

`meigen gen --help` 查看所有参数。

### 其他 MCP 兼容客户端

添加到 MCP 配置文件（如 `.mcp.json`、`claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "meigen": {
      "command": "npx",
      "args": ["-y", "meigen@2.0.2"],
      "env": {
        "MEIGEN_API_TOKEN": "meigen_sk_..."
      }
    }
  }
}
```

> 即使没有 API Key，免费功能（灵感搜索、提示词增强、模型列表）也可以直接使用。

### Hermes Agent (NousResearch)

[Hermes Agent](https://github.com/NousResearch/hermes-agent) 原生支持 MCP — 在 `~/.hermes/config.yaml` 加上:

```yaml
mcp_servers:
  meigen:
    command: "npx"
    args: ["-y", "meigen@2.0.2"]
    env:
      MEIGEN_API_TOKEN: "meigen_sk_..."
    timeout: 2700         # generate_video 会等到服务端报终态(长视频可达 15+ 分钟),Hermes 默认 120s 会超时
    connect_timeout: 120  # 首次 npx 下载可能需要一分钟
```

> `timeout: 2700` 和 `connect_timeout: 120` 这两个覆盖很重要 — Hermes 默认(120s / 60s)是给短命令调好的,视频生成或首次 npx 下载会超。

<a id="providers"></a>

## 生成后端

| 后端 | 配置方式 | 范围 |
|---|---|---|
| MeiGen 云端 | 远程 OAuth 或私密 API Key；本地使用 `MEIGEN_API_TOKEN` | 图片、视频与五项 Skills，使用购买积分 |
| OpenAI 兼容 API | 设置 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL` | 本地普通生图，供应商自行计费 |
| ComfyUI | 设置 `COMFYUI_URL`，导入 API JSON 格式工作流 | 本地普通生图，使用自己的 GPU |

Claude Code 插件用户可用 `/meigen:setup` 配置后端；其他客户端使用自己的连接设置。自动打开本地结果默认关闭，可在插件宿主环境设置 `MEIGEN_AUTO_OPEN=1` 启用 macOS 预览。

## 配置文件与环境变量

### 配置文件

配置存储在 `~/.config/meigen/config.json`。ComfyUI 工作流存储在 `~/.config/meigen/workflows/`。

### 环境变量

环境变量优先级高于配置文件。

| 变量 | 说明 |
|------|------|
| `MEIGEN_API_TOKEN` | MeiGen API Key；五项 Skills 和 MeiGen 生成必需 |
| `MEIGEN_BASE_URL` | 本地服务调用的 API 源站，默认 `https://www.meigen.ai`；开发后端时显式指定本地地址。 |
| `MEIGEN_REQUEST_STORE_DIR` | 本地私有回执目录，默认 `~/.meigen/requests`。填写当前用户所有、可写、非符号链接目录的绝对路径，POSIX 权限须为 0700。存储不可用时使用进程内缓存并返回 `receiptWarning`；上层仍需保存返回的请求 ID 和原始参数，以便重启后恢复。 |
| `UPLOAD_GATEWAY_URL` | 本地参考图上传网关，默认 `https://gen.meigen.ai`；独立于 `MEIGEN_BASE_URL`。 |
| `OPENAI_API_KEY` | 你的 API Key（任意 OpenAI 兼容供应商） |
| `OPENAI_BASE_URL` | API 地址 — 修改此项以接入 Together AI、Fireworks AI 等 |
| `OPENAI_MODEL` | 端点支持的模型 ID |
| `COMFYUI_URL` | ComfyUI 服务地址（默认：`http://localhost:8188`） |
| `MEIGEN_OUTPUT_DIR` | 生成图像的本地保存目录（默认：`~/Pictures/meigen`）。沙箱环境（如 OpenClaw）无法访问默认路径时使用。 |
| `MEIGEN_VIDEO_OUTPUT_DIR` | 生成视频的本地保存目录（默认：`~/Movies/meigen`）。 |
| `XDG_PICTURES_DIR` | 仅 Linux — `MEIGEN_OUTPUT_DIR` 未设时,图像保存到 `$XDG_PICTURES_DIR/meigen`(由桌面环境设置)。未设时回退 `~/Pictures/meigen`。 |
| `XDG_VIDEOS_DIR` | 仅 Linux — 同 `XDG_PICTURES_DIR` 但对视频生效,回退 `~/Movies/meigen`。 |

## 隐私

MeiGen MCP 尊重你的隐私。以下是数据处理方式：

- **ComfyUI（本地）** — 使用本地工作流和本地文件时，可以不经过云端生成。画廊查询和 MeiGen Skills 仍会使用外部服务。
- **MeiGen 云端与 Skills** — 提示词和参考图由 MeiGen 及其生成供应商处理，结果图片存储在 Cloudflare R2。详见 [MeiGen 隐私政策](https://www.meigen.ai/privacy-policy-zh)。
- **OpenAI 兼容 API** — 提示词和参考图会发送到你配置的 API 端点。请参考你的服务商隐私政策。
- **参考图上传** — 本地文件通过配置的上传网关（默认 `gen.meigen.ai`）上传到 Cloudflare R2。本地 MCP 的普通生成和标准 Skill 参考图以 4096px / 8 MiB 为目标；独立 `meigen gen` CLI 仍以 2 MiB 为压缩目标；upscale 保留原尺寸，限制见 [Skill API 指南](SKILLS_API.md#upscale)。Skill 图片会完整解码、修正方向、清除元数据并保留透明；GIF 参考图只取首帧。远程 Skill 上传需要 MeiGen 账号授权（OAuth 或 API Key）。持有链接的人可以访问参考图。重试时保留已受理的 URL，同时保留原始素材并下载需要保存的结果；链接不作永久存档保证。ComfyUI 可直接使用本地路径而不上传。
- **灵感搜索** — 带查询词时会请求 MeiGen API(查询文本发送到 `www.meigen.ai`);分类浏览与离线兜底使用内置本地数据。**提示词增强**完全本地运行,不调用外部 API。

本地 npm 服务不添加遥测。发送到 MeiGen 的请求适用其服务与隐私政策。

### 自定义存储后端

如果你希望使用自己的 S3/R2 存储桶上传参考图,设置 `UPLOAD_GATEWAY_URL` 环境变量或在 `~/.config/meigen/config.json` 中设置 `uploadGatewayUrl`,指向你自己的 presign 接口。接口需实现:

```
POST /upload/presign
Content-Type: application/json

请求:  { "filename": "photo.jpg", "contentType": "image/jpeg", "size": 123456 }
响应:  { "success": true, "presignedUrl": "https://...", "publicUrl": "https://..." }
```

`presignedUrl` 用于 `PUT` 上传，`publicUrl` 是返回给用户的公开可访问 URL。此配置用于本地上传。普通 Skill 的本地上传若返回自定义 CDN，服务会自动通过已鉴权的 `/api/skills/upload` 转存再提交。upscale 则将公开原图链接直接交给后端验证和准备。自定义网关返回的图片必须无需登录、无需重定向即可公开访问。

## 常见问题

| 问题 | 下一步 |
|---|---|
| 看不到新增 Skills | 远程：后端部署后刷新/重连工具列表。本地：确认连接使用 `meigen@2.0.2` 后重启。仅安装 npm 不会部署 API。 |
| Key 无效或缺失 | 在[桌面 API Keys](https://www.meigen.ai/profile/api-keys)创建/检查 Key，更新 MCP 连接请求头或 `MEIGEN_API_TOKEN`。修改环境变量后重启本地服务，不要把 Key 发到聊天中。 |
| 网站显示有积分，API 却提示不足 | API **只消耗购买积分**，不使用每日免费积分。使用同一账号在[个人主页 → 充值](https://www.meigen.ai/profile)购买积分后，再让助手继续；被拒绝的请求不应反复查询状态。 |
| 图片上传失败 | 使用真实本地文件（本地 npm）或公开 HTTPS 图片直链，检查格式和大小，避免需登录或重定向的链接。宿主无法读取附件时改用直链。上传失败尚未开始生成。 |
| 工具超时或宿主重启 | Skills 用 `check_skill`，普通图片/视频任务用 `check_generation` 恢复，不要自动发起新的付费请求。宿主默认 60 秒工具超时时，可将 Skill 提交的超时调长，例如 240 秒。 |
| 部分商品详情图失败 | 保留并展示已完成的图片，分别说明失败模块及返回的退款状态。不要自动重做整批或增加付费替代图。 |
| 请求被限流 | 按返回的指引等待。每日请求上限与积分余额不同，反复查询或充值不会重置次数。 |
| 已配 OpenAI 或 ComfyUI，Skill 仍要求 MeiGen Key | 这些后端用于本地普通生图；五项 Skills 使用 MeiGen 云端与购买积分。 |

Skill 客户端实现说明：在内部生成 `requestId`，保存原始参数，中断后先查询 `check_skill`。遵循 `nextAction`；处理中通常建议间隔 10 秒查询。恢复时完整沿用 `retryParameters`，包括原上传 URL。新 ID 代表新的付费尝试，同一 ID 下修改参数会被拒绝。这些 ID 应由客户端管理，无需向用户询问。

<a id="upgrading"></a>

## 从旧版本升级

- **远程 MCP：** URL 和有效的 MeiGen Key 可继续使用。后端发布后重新连接，调用 `list_skills`；应看到五项 Skills、共 14 个工具。仅更新 npm 不会启用远程 API。
- **本地 npm：** 固定版本配置改为 `meigen@2.0.2` 并重启；全局安装用户执行 `npm install -g meigen@2.0.2`。本地共 17 个工具。先确认 npm 上已有该版本。
- **插件用户：** Claude marketplace、OpenClaw 插件与独立 ClawHub Skill 分别更新；仅更新 npm 不会刷新安装时复制的指导文件。使用插件内置连接时，不要再手动添加第二套 MCP。
- **工作流调用：** 本地保留 `wait: true`／`download: true` 默认值；新工作流应持久化 UUID `requestId`、用 `wait: false` 并按原 ID 恢复。远程保留旧 `attemptId`，但无法对所有旧回执追溯证明历史参数一致性。服务器和插件指引都需更新，才能使用可选创意流程。
- **现有配置和任务：** 通用生图仍可使用原来的 MeiGen/OpenAI/ComfyUI 配置；五项 Skills 需要已授权的 MeiGen 账号与购买积分（本地 npm/API Key 路径使用 Key）。中断任务保留原 ID 和输入，先恢复，不能为升级重新付费提交。
- **材料变化：** 本地 Skill 路径必须为绝对路径、`~/` 或 `file://`；不再按不可见的进程目录猜相对路径。图片会清除元数据，GIF 只取首帧；upscale 要传静态原图。保留原始素材并下载需要保存的结果；结果链接不作永久存档保证。
