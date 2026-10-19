# 在上层工作流中组合 MeiGen

[English](COMPOSABLE_WORKFLOWS.md) · [连接设置](README.zh-CN.md#快速开始) · [五项 Skills HTTP API](SKILLS_API.md)

MeiGen 可以作为已有 agent、Skill、脚本或应用中的一个调用步骤。上层负责创意计划、提示词、模型／供应商、数量、已批准预算、调度和展示。MeiGen 创意助手是可选能力，不是调用工具的前置条件；任何工作流都可以使用发现工具。上层已经确定的计划，无需为每张首帧、每段视频或每批结果重复确认。

本地要求 **`meigen` 2.0.1 或更高版本**（`npx -y meigen@3.3.1`；2.0.0 不支持 `referenceVideos` / `referenceAudios`），远程使用已更新的 **`https://www.meigen.ai/api/mcp`**。npm 1.4.0 不支持本页合同。重新连接并检查实际 schema 是否包含 `requestId`、`wait` 和按请求查询。后端回滚时应保留恢复端点及幂等 POST 合同；无需撤回用户已安装的 npm 包。

## Midjourney 高级参数（3.3.0）

图片工具新增可选的 `referenceType: "content" | "style"` 和 `niji7Options`，字段名与 Web/App 相同。后者包含 `stylize`、`chaos`、`raw`、`iw`、`sref`、`sw`、`sv`、`profile` 和 MJ 专用的 `quality: "1" | "4"`；不要与顶层通用图片 `quality` 混用。V8.2 忽略 `weird`，`sv` 固定为 6。其他提示词参数会被服务端清理，优先使用结构化字段。

已保存的任务参数可包含 `referenceType: "style", niji7Options: { quality: "1", stylize: 250, sw: 300, profile: "abc def" }`。本地风格图片放入 `referenceImages` 自动上传，不要把文件路径放入 `sref`。风格图片优先于 sref 码，角色仍按内容参考处理。

省略新字段保持旧请求行为。恢复时保留原参数与 `requestId`；修改参考类型或高级参数需要新任务并重新获得相应生成授权。这些字段需更新远程部署或安装 npm 3.3.0 及以上版本；3.2.0 不含这些字段。

## 普通生成任务合同

| 字段或工具 | 行为 |
| --- | --- |
| `requestId` | 每个逻辑图片／视频尝试使用一个 UUID，并在提交前持久化。恢复沿用同一 ID 和原始参数；真正的新付费尝试才使用新 ID。 |
| `wait: false` | 提交后返回任务句柄，不等待成图／视频。本地 npm 此模式必须提供 `requestId`；远程生成始终需要 `requestId` 或旧版 `attemptId`。 |
| `wait: true` | 保持既有默认行为：等待完成，或返回可恢复的处理中／错误状态。工具超时不会取消已受理任务。 |
| `download: false` | 仅本地 npm：只需要 URL 时跳过媒体保存。兼容默认值仍为 `true`；`wait: false` 无论此值如何都跳过下载。远程 MCP 没有 `download` 参数，返回 URL。 |
| `check_generation` | 提供原 `requestId` 或返回的 `generationId`，二选一。继续查询时原样传递返回的 `nextAction.arguments`，保留其中可选的原始意图 `requestedMediaType`（`image` 或 `video`）；手工恢复时，已知则从保存的计划补上该意图。MeiGen 请求可以跨宿主／进程重启恢复，不只依赖本地缓存。 |
| `firstFrame` | 将已完成首帧的 URL 交给支持图生视频的模型。是否先检查或展示首帧，由上层决定。 |

以上可恢复云端任务合同适用于 MeiGen。可选的本地 OpenAI-compatible 后端异步能力可能不同，应读取实际 schema 和返回错误，不能假设它们存在 MeiGen 请求回执。保留调用方指定的模型、供应商和参数。需要查询当前能力或价格时均可使用 `list_models`；视频必须指定模型。

使用 `structuredContent` 推进工作流，不依赖人类可读文案或本地文件名。普通生成结果在信息可用时包含：

- `success`、`status`：`processing`、`completed`、`failed`、`error` 或 `unknown`。
- `requestId`、`generationId`、实际 `mediaType`、可选的原始意图 `requestedMediaType`、`modelId`、`deduped`。
- `urls`，始终为数组；以及返回时存在的 `imageUrl` 或 `videoUrl`。
- `creditsUsed`、`creditsStatus`；只有账务状态确认后才能声明退款。
- `pollAfterSeconds`、`observationEnded`；`nextAction` 可包含 `type`、`tool`、`arguments`、`afterSeconds`、`message`。
- `error`：`code`、`message`、`retryable`，以及可选的 `httpStatus`、`retryAfterSeconds`、`required`、`available`。
- 本地 npm 还可能包含 `provider`、`savedPath`、`downloadWarning`（生成成功，但本地保存失败）和 `receiptWarning`（私有持久回执不可用，上层需保存请求 ID 和原始参数）。

已提交不等于已生成。`unknown` 是观察／恢复状态，不代表可以创建替代任务。普通任务使用 `check_generation`；五项专用 Skills 使用 `check_skill`、原 Skill／请求 ID 及完整 `retryParameters`。Skill 回执仍要求原 API Key；普通请求允许同一账号的另一个有效 API Key 恢复。不能将 Web session 免费积分任务转作 API Token 账务使用。

## 最小调用

以下完整步骤只依赖已连接并认证的 MCP `client`，不依赖额外的计划变量。提交前保存 `input`；下方 UUID 仅用于这一次示例，新的生成意图应使用新 UUID，恢复时沿用已保存的 ID。

```js
const input = {
  requestId: '6aa98390-dc79-49f2-8996-20c915968bd8',
  prompt: 'A ceramic teapot on a pale wooden table, soft window light',
  wait: false,
};
const submitted = await client.callTool({ name: 'generate_image', arguments: input });
const result = submitted.structuredContent;
if (result.nextAction?.type === 'check_generation') {
  const checked = await client.callTool({
    name: 'check_generation', arguments: result.nextAction.arguments,
  });
  // Persist checked.structuredContent; follow nextAction before advancing.
}
```

## 示例：N 个脚本 → N 张首帧 → N 段视频

上层先确定脚本、图像／视频参数、输出数量、批准的最高预算和替代失败任务的规则。可以通过 `list_models` 查询当前选项；此处不假定固定模型、价格、时长或质量。

1. 每个脚本创建并保存一个首帧 UUID 和一个视频 UUID，以及精确输入。只在创建新工作流时执行一次，重跑或恢复时不能重新分配。
2. 每次新提交前，按当前选定模型、档位、时长和参考素材价格预留预计费用，同时计入全部在途预留。返回后用实际 `creditsUsed` 和已确认退款核算；费用未明确时继续保留预算。
3. 对独立首帧采用有限并发，立即保存每次响应。首帧完成后，先将选定 URL 保存为对应视频的固定输入，再提交视频。如果模型返回多张候选图，上层需保存选定的那张。
4. 使用已有句柄查询或恢复。宿主重启时读取保存的计划，查询待完成步骤；不重建 UUID，也不重新上传没有变化的参考图。
5. 把完成视频和失败／未明确的步骤交回上层。中间预览、视觉检查、下载、最终展示以及已授权的失败替代均由上层决定。

以下 JavaScript 展示已有调用方中的 MCP 调用。`script`、参数和持久化 ID 来自上层保存的计划，`client` 是已连接的 MCP 客户端。这是调用示例，不是调度器或新的 API SDK。

```js
// 从已保存计划读取此步骤，恢复时不能创建新 ID。
const frame = await client.callTool({
  name: 'generate_image',
  arguments: {
    ...plan.frameSettings,
    prompt: script.framePrompt,
    requestId: script.frameRequestId,
    wait: false,
    download: false, // 仅本地 npm；远程 MCP 省略此字段。
  },
});
// 推进工作流之前，先保存 frame.structuredContent。

const frameStatus = await client.callTool({
  name: 'check_generation',
  arguments: { requestId: script.frameRequestId, requestedMediaType: 'image' },
});
// processing 时按返回的查询间隔等待后重查。
// 仅在 completed、媒体类型符合预期且具有真实 URL 时推进。
// 先处理 check_backend／review_media_type，不能自动重新提交。
```

```js
// 内容参考模式；不要同时设置 firstFrame/lastFrame。
// 使用当前模型/tier 的 referenceMentionSyntax；未声明时才回退到 Video N / Audio N。
// 按实际 billing 能力估价，不能假定所有模型都累计输入视频秒数。
const videoLabel = plan.videoInputs.referenceMentionSyntax?.video.replace('N', '1') ?? 'Video 1';
const audioLabel = plan.videoInputs.referenceMentionSyntax?.audio.replace('N', '1') ?? 'Audio 1';
const video = await client.callTool({
  name: 'generate_video',
  arguments: {
    ...plan.videoSettings, // 包含上层从当前能力中选定的模型。
    prompt: `延续这段素材：${script.videoPrompt} 保持 ${videoLabel} 的运镜和 ${audioLabel} 的节奏。`,
    contentReferenceImages: [script.selectedFrameUrl],
    referenceVideos: [script.referenceClipUrl, '/Users/me/clips/pan.mp4'], // images.meigen.ai 的 URL 原样透传；本地文件路径仅本地 npm 版会自动上传（远程 MCP 只收 images.meigen.ai 的 URL）。
    referenceAudios: ['/Users/me/audio/theme.mp3'],
    requestId: script.videoRequestId,
    wait: false,
    download: false, // 仅本地 npm；远程 MCP 省略。
  },
});
// 保存 video.structuredContent；恢复沿用原 videoRequestId。
```

本地 npm 具有 **4 个共享 API 提交槽位**。查询和下载不占用这些槽位；它不限制已经受理、仍在远程运行的任务数量。上层应同时限制提交并发和未完成付费任务数量，并遵循实际后端限流与 `Retry-After`。不存在通用的“最多 10 张”工作流上限，也不禁止已授权视频任务并发。

预算由调用方管理，不是服务端原子执行的整批预算上限。估价可能变化；新增价格或缩图代价超出已批准范围时应暂停处理。独立步骤可能部分成功，失败不会回滚已经完成的首帧或视频。

本地 `wait: true` 对暂态状态查询错误进行有界重试：连续三次错误后停止，成功状态查询重置计数；遵守较长的 `Retry-After`，查询和退避都计入总观察预算。取消或终态错误立即停止。这只重试查询，不重发生成 POST，也不说明任务已取消、失败或退款。

## 恢复时避免重复生成

| 情况 | 下一步 |
| --- | --- |
| `processing` | 保存句柄，遵循 `pollAfterSeconds`／`nextAction`，不重复提交。 |
| 网络超时、5xx、提交结果不确定 | 使用已保存 `requestId` 调用 `check_generation`。保留参数和素材 URL；恢复动作要求重交时仍使用该 ID。 |
| JSON `request_not_found` + HTTP 404 | 核实账号、ID 和保存参数。首次提交中断可沿用原 ID 重交；不能换新 ID。 |
| `endpoint_unavailable`／`check_backend` | HTML 或不明 JSON 404 不代表从未提交。保留 ID 和参数，检查 API 地址并恢复兼容后端；不能自动重交。已知 generationId 仍可走原状态接口查询。 |
| `review_media_type` | 结果已完成，保留 success、实际媒体和 URL。比较 requestedMediaType，核对模型后再推进工作流；不能自动生成替代结果。 |
| 普通生成派发前 402 | 给所属账号充值后，在已批准范围内用原 ID 和相同参数重交；只轮询不会重启。Skill 付款拒绝遵循其独立规则。 |
| 429 或处理中占位 | 遵循返回的等待时间／`Retry-After`，保留尝试和预算预留。 |
| `idempotency_conflict`／`request_id_collision` | 停止并检查原尝试，不能自动换 ID 绕过冲突。新的意图和输入应是另一个已授权尝试。 |
| `failed` | 保留其它成功步骤和报告的退款状态。替代任务是新付费尝试，需要在明确批准的替代范围内。 |
| 原任务已删除／HTTP 410 | 保留尝试 ID 并报告原任务不可用，不能复用该 ID 创建替代任务。 |
| `observationEnded` | 停止密集轮询，把未明确状态交回上层；不能据此断言失败或取消。 |

远程普通生成保留旧版 `attemptId` 兼容入口；新集成优先使用 UUID `requestId`。旧回执可能没有核验所有历史参数所需的标准化输入，因此不能宣称新保护能够追溯验证每一个旧任务。

**旧请求与换 Key：** 使用旧 `attemptId` 提交但丢失响应时，应先用原 Key 恢复，再撤销该 Key。旧句柄包含 Key，新 Key 无法重建尚未记录的旧身份。已有 `generationId` 时应保存；不要用新 Key 自动重交仍未明确的旧尝试。

## Seedance 草稿步骤（尚未发布的源码）

先查询 `capabilities.draft.enabled` 和当前 480p 费率。明确授权后，在 `generate_video` 中传 `draft: true` 创建 480p 预览。通过原请求 ID 查询并展示完成的草稿、有效期及 `seedanceDraft.finalCredits`。用户另行确认费用后，才调用 `render_video_draft`，传入独立且持久化的 `requestId`、`sourceDraftGenerationId` 和 `confirmedCredits`。成片收取完整 1080p 费用，并非差价。不传 `draft` 时普通生成保持不变。

保留两笔任务的 ID 和预算预留。通过 `check_generation` 恢复成片，失败后不得自动创建替代任务。用户授权重试失败成片时，另传 `retryFailedGenerationId` 并使用新请求 ID。草稿自上游创建起七天过期。详见[完整草稿指南](https://docs.meigen.ai/zh/mcp/drafts)。本地 npm 需要 3.2.0 或更高版本及兼容后端；更新 npm 版本并重连后发现新工具。
