/**
 * `meigen gen` — one-shot image generation from the terminal.
 *
 * Targets shell scripts / CI pipelines that want to use MeiGen without an MCP
 * host. Calls the MeiGen platform API directly (OpenAI-compatible and ComfyUI
 * paths are intentionally not exposed here — they're MCP host concerns).
 *
 * Usage:
 *   meigen gen --prompt "a cat in space"
 *   meigen gen --prompt "..." --model midjourney-v8.1 --ratio 16:9
 *   meigen gen --prompt "..." --resolution 2K --quality high
 *   meigen gen --prompt "..." --reference ~/Pictures/logo.png
 *   meigen gen --prompt "..." --json    # machine-readable output
 *   meigen gen --prompt "..." --no-wait # submit only, print generationId
 */

import { loadConfig } from '../config.js'
import { MeiGenApiClient } from '../lib/meigen-api.js'
import { saveImageLocally } from '../lib/save-image.js'
import { processAndUploadImage } from '../lib/upload.js'
import { unsafeReferenceUrlReason } from '../lib/url-safety.js'
import { existsSync } from 'fs'
import { homedir } from 'os'

interface GenArgs {
  prompt?: string
  model?: string
  ratio?: string
  resolution?: string
  quality?: string
  reference?: string
  wait: boolean
  json: boolean
  help: boolean
}

function parseArgs(argv: string[]): GenArgs {
  const args: GenArgs = { wait: true, json: false, help: false }

  /**
   * Eat the next argv slot as the value for `flag`. Reject when the next slot
   * is missing or itself a flag (`--foo --bar` would otherwise silently set
   * `foo='--bar'` and submit a generation with prompt "--bar").
   */
  const takeValue = (i: number, flag: string): string | null => {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--') || v.startsWith('-') && v.length > 1 && isNaN(Number(v))) {
      console.error(`Error: ${flag} requires a value.`)
      args.help = true
      return null
    }
    return v
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '-h':
      case '--help':
        args.help = true
        break
      case '--prompt':
      case '-p': {
        const v = takeValue(i, a); if (v === null) return args
        args.prompt = v; i++; break
      }
      case '--model':
      case '-m': {
        const v = takeValue(i, a); if (v === null) return args
        args.model = v; i++; break
      }
      case '--ratio':
      case '-r':
      case '--aspect-ratio': {
        const v = takeValue(i, a); if (v === null) return args
        args.ratio = v; i++; break
      }
      case '--resolution': {
        const v = takeValue(i, a); if (v === null) return args
        args.resolution = v; i++; break
      }
      case '--quality': {
        const v = takeValue(i, a); if (v === null) return args
        args.quality = v; i++; break
      }
      case '--reference':
      case '--ref': {
        const v = takeValue(i, a); if (v === null) return args
        args.reference = v; i++; break
      }
      case '--no-wait':
        args.wait = false
        break
      case '--json':
        args.json = true
        break
      default:
        if (a.startsWith('--')) {
          console.error(`Unknown flag: ${a}`)
          args.help = true
        }
    }
  }
  return args
}

function printUsage(): void {
  console.log('Usage: meigen gen --prompt "<text>" [options]')
  console.log()
  console.log('Required:')
  console.log('  --prompt, -p <text>     The image prompt')
  console.log()
  console.log('Optional:')
  console.log('  --model, -m <id>        Model ID (run `meigen` MCP `list_models` for ids)')
  console.log('  --ratio, -r <ratio>     Aspect ratio: 1:1 / 16:9 / 9:16 / 4:3 / 3:4 / auto')
  console.log('  --resolution <r>        1K / 2K / 4K (model-dependent)')
  console.log('  --quality <q>           low / medium / high (model-dependent)')
  console.log('  --reference <path|url>  One reference image (local path auto-uploaded)')
  console.log('  --no-wait               Submit only — print generationId without polling')
  console.log('  --json                  Machine-readable output')
  console.log()
  console.log('Auth: set MEIGEN_API_TOKEN env var, or run `meigen init <platform>` and store')
  console.log('the token in ~/.config/meigen/config.json.')
  console.log()
  console.log('Examples:')
  console.log('  meigen gen --prompt "a calico cat in a sunlit kitchen"')
  console.log('  meigen gen -p "logo design" -m midjourney-v8.1 -r 1:1')
  console.log('  meigen gen -p "product hero shot" --ref ~/Desktop/bottle.jpg --json')
}

/** Resolve `~` and `file://` prefixes for local reference paths. */
function resolveLocalRef(ref: string): string {
  if (ref.startsWith('file://')) return ref.slice(7)
  if (ref.startsWith('~')) return homedir() + ref.slice(1)
  return ref
}

function isLocalRef(ref: string): boolean {
  if (ref.startsWith('http://') || ref.startsWith('https://')) return false
  if (ref.startsWith('file://')) return true
  return ref.startsWith('/') || ref.startsWith('~') || /^[A-Z]:[/\\]/i.test(ref)
}

export async function gen(argv: string[]): Promise<void> {
  const args = parseArgs(argv)

  if (args.help || !args.prompt) {
    if (!args.prompt && !args.help) {
      console.error('Error: --prompt is required.\n')
    }
    printUsage()
    process.exit(args.prompt ? 0 : 1)
  }

  const config = loadConfig()
  if (!config.meigenApiToken) {
    console.error('Error: MEIGEN_API_TOKEN is not set.')
    console.error()
    console.error('Get a token at https://www.meigen.ai (Settings → API Keys),')
    console.error('then export it:')
    console.error('  export MEIGEN_API_TOKEN=meigen_sk_...')
    process.exit(1)
  }

  const client = new MeiGenApiClient(config)

  // Optional reference image — upload local files to R2 before submit
  let referenceImages: string[] | undefined
  if (args.reference) {
    if (isLocalRef(args.reference)) {
      const filePath = resolveLocalRef(args.reference)
      if (!existsSync(filePath)) {
        console.error(`Error: reference image not found at ${filePath}`)
        process.exit(1)
      }
      if (!args.json) process.stderr.write(`Uploading reference image...\n`)
      const uploaded = await processAndUploadImage(filePath, config)
      referenceImages = [uploaded.publicUrl]
    } else {
      const unsafe = unsafeReferenceUrlReason(args.reference)
      if (unsafe) {
        console.error(`Error: reference URL rejected: ${unsafe}`)
        console.error(`URL: ${args.reference}`)
        process.exit(1)
      }
      referenceImages = [args.reference]
    }
  }

  if (!args.json) process.stderr.write(`Submitting generation...\n`)
  const submitResponse = await client.generateImage({
    prompt: args.prompt,
    modelId: args.model,
    aspectRatio: args.ratio,
    resolution: args.resolution,
    quality: args.quality,
    referenceImages,
  })

  if (!submitResponse.generationId) {
    console.error('Error: backend did not return a generation ID.')
    process.exit(1)
  }

  // --no-wait: emit generationId and bail (caller can poll with status endpoint later).
  if (!args.wait) {
    const out = { generationId: submitResponse.generationId, modelId: submitResponse.modelId, status: 'submitted' }
    if (args.json) {
      console.log(JSON.stringify(out))
    } else {
      console.log(`Submitted. generationId: ${submitResponse.generationId}`)
      if (submitResponse.modelId) console.log(`model: ${submitResponse.modelId}`)
      console.log(`Poll status at: ${config.meigenBaseUrl}/api/generate/v2/status/${submitResponse.generationId}`)
    }
    return
  }

  // ⚠️ CLI 无跨进程幂等保护(attempt-store 是进程内 Map,进程退出即消失;十三审):
  // 提交时的 UUID 幂等键只防单次进程内的 HTTP 层重放。轮询中断后重跑 CLI = 新单;
  // 错误信息始终带 generationId,人工去 gallery/status 续查,不要盲目重跑。
  // Block until terminal status
  if (!args.json) process.stderr.write(`Waiting for result...\n`)
  let status
  try {
    status = await client.waitForGeneration(
      submitResponse.generationId,
      undefined, // 服务端 pollHintSeconds 驱动;本地仅安全阀(POLL_SAFETY_VALVE_MS)

      async (elapsedMs) => {
        if (!args.json) {
          process.stderr.write(`  still working... (${Math.round(elapsedMs / 1000)}s)\n`)
        }
      },
    )
  } catch (err) {
    // Wrap polling errors so the user keeps the generationId (vital for
    // checking job state / requesting refunds out-of-band on timeout).
    const msg = err instanceof Error ? err.message : String(err)
    if (args.json) {
      console.log(JSON.stringify({
        status: 'incomplete',
        generationId: submitResponse.generationId,
        modelId: submitResponse.modelId,
        error: msg,
      }))
    } else {
      console.error(`Polling failed: ${msg}`)
      console.error(`generationId: ${submitResponse.generationId}`)
      console.error(`Job may still be running — check ${config.meigenBaseUrl} before retrying.`)
    }
    process.exit(1)
  }

  if (status.status === 'failed') {
    console.error(`Generation failed: ${status.error || 'unknown error'}`)
    process.exit(1)
  }

  if (status.mediaType === 'video') {
    // 视频模型误用:任务已扣费,交付 URL+ID 而非报错退出(十二审 P2)
    console.log('This model produced a VIDEO (charged once — do NOT re-run):')
    console.log(`Generation ID: ${submitResponse.generationId}`)
    if (!status.videoUrl) {
      // 无 URL 不能装成功(workflow 六审):exit 1 + 引导续查,与图片同款守卫
      console.error(`No video URL in the response — check ${config.meigenBaseUrl} gallery; do NOT re-run (it would charge again).`)
      process.exit(1)
    }
    console.log(`Video URL: ${status.videoUrl}`)
    process.exit(0)
  }

  const allImageUrls = status.imageUrls?.length ? status.imageUrls : (status.imageUrl ? [status.imageUrl] : [])
  if (allImageUrls.length === 0) {
    console.error(`Error: generation ${submitResponse.generationId} completed but no image URL — check ${config.meigenBaseUrl} gallery; do NOT re-run (it would charge again).`)
    process.exit(1)
  }
  // Download + save first image locally
  let savedPath: string | undefined
  try {
    const res = await fetch(allImageUrls[0])
    if (res.ok) {
      const buffer = await res.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      const mimeType = res.headers.get('content-type') || 'image/jpeg'
      savedPath = saveImageLocally(base64, mimeType)
    }
  } catch {
    // Save is best-effort — caller still has the URL.
  }

  const actualModel = submitResponse.modelId || args.model || 'meigen-default'

  if (args.json) {
    console.log(JSON.stringify({
      status: 'completed',
      generationId: submitResponse.generationId,
      modelId: actualModel,
      imageUrls: allImageUrls,
      savedPath: savedPath || null,
    }))
    return
  }

  console.log()
  console.log(`Image generated successfully.`)
  console.log(`  Model: ${actualModel}`)
  if (allImageUrls.length > 1) {
    console.log(`  ${allImageUrls.length} candidate images:`)
    allImageUrls.forEach((url, i) => console.log(`    ${i + 1}. ${url}`))
  } else {
    console.log(`  URL:   ${allImageUrls[0]}`)
  }
  if (savedPath) console.log(`  Saved: ${savedPath}`)
}
