import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, readdir, writeFile, stat, truncate } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import apiModule from '../lib/meigen-api.js'
import operationModule from '../lib/generation-operation.js'
import contractModule from '../lib/generation-contract.js'
import uploadModule from '../lib/upload.js'
import referencesModule from '../lib/generation-references.js'
import httpModule from '../lib/generation-http.js'
const { MeiGenApiClient } = apiModule
const { runMeiGenGeneration, generationStatusOutput } = operationModule
const { GenerationError, errorOutput } = contractModule
const { streamResponseToFile, withHttpResponse } = httpModule
const config = { meigenBaseUrl: 'https://api.example', meigenApiToken: 'fixture-key', uploadGatewayUrl: 'https://upload.example' }
async function isolated(run) {
  const directory = await mkdtemp(join(tmpdir(), 'meigen-runtime-recovery-'))
  const previous = { fetch: globalThis.fetch, store: process.env.MEIGEN_REQUEST_STORE_DIR, video: process.env.MEIGEN_VIDEO_OUTPUT_DIR }
  process.env.MEIGEN_REQUEST_STORE_DIR = join(directory, 'receipts')
  process.env.MEIGEN_VIDEO_OUTPUT_DIR = join(directory, 'video')
  try { await run(directory) } finally {
    globalThis.fetch = previous.fetch
    for (const [key, value] of [['MEIGEN_REQUEST_STORE_DIR', previous.store], ['MEIGEN_VIDEO_OUTPUT_DIR', previous.video]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
    await rm(directory, { recursive: true, force: true })
  }
}
const client = () => new MeiGenApiClient(config)
const completed = { success: true, status: 'completed', generationId: 'accepted-job', imageUrl: 'https://images.meigen.ai/ready.png', mediaType: 'image' }

test('explicit requestId with no local receipt recovers remotely before re-uploading any references', () => isolated(async directory => {
  const source = join(directory, 'source.png')
  await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toFile(source)
  const calls = []
  globalThis.fetch = async url => { calls.push(String(url)); assert.match(String(url), /\/requests\//); return Response.json(completed) }
  const output = await runMeiGenGeneration('image', { prompt: 'recover original request', referenceImages: [source], requestId: randomUUID(), wait: false }, client(), config)
  assert.equal(output.generationId, 'accepted-job'); assert.equal(output.deduped, true); assert.equal(calls.length, 1)
}))

test('unavailable receipt storage falls back safely, retains memory identity, and revalidates backend on retry', () => isolated(async directory => {
  await writeFile(process.env.MEIGEN_REQUEST_STORE_DIR, 'occupied by a regular file')
  let accepted = false; let posts = 0; let gets = 0
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/requests/')) { gets++; return accepted ? Response.json(completed) : Response.json({ success: false, code: 'request_not_found' }, { status: 404 }) }
    posts++; assert.equal(init.method, 'POST'); accepted = true; return Response.json({ success: true, generationId: 'accepted-job' })
  }
  const input = { prompt: 'one paid image', requestId: randomUUID(), wait: false }
  const first = await runMeiGenGeneration('image', input, client(), config)
  assert.equal(first.success, true); assert.match(first.receiptWarning, /bounded memory cache/)
  assert.equal((await runMeiGenGeneration('image', input, client(), config)).generationId, 'accepted-job')
  assert.equal((await runMeiGenGeneration('image', { ...input, prompt: 'different' }, client(), config)).error.code, 'idempotency_conflict')
  assert.equal(posts, 1); assert.equal(gets, 2)
  assert.equal(await readFile(process.env.MEIGEN_REQUEST_STORE_DIR, 'utf8'), 'occupied by a regular file')
  assert.deepEqual(await readdir(directory), ['receipts'])
}))

test('unavailable local storage never turns an inconclusive backend lookup into a paid POST', () => isolated(async () => {
  await writeFile(process.env.MEIGEN_REQUEST_STORE_DIR, 'occupied')
  const calls = []; const requestId = randomUUID()
  globalThis.fetch = async (url, init) => { calls.push(init.method ?? 'GET'); return Response.json({ success: false, code: 'temporarily_unavailable', retryable: true }, { status: 503 }) }
  const output = await runMeiGenGeneration('image', { prompt: 'recover', requestId, wait: false }, client(), config)
  assert.deepEqual(calls, ['GET']); assert.equal(output.requestId, requestId); assert.match(output.receiptWarning, /check_generation/)
  assert.equal(output.nextAction.type, 'check_generation')
}))

test('corrupted private identity remains fail-closed instead of being replaced by the memory fallback', () => isolated(async () => {
  globalThis.fetch = async url => String(url).includes('/requests/') ? Response.json({ success: false, code: 'request_not_found' }, { status: 404 }) : Response.json({ success: true, generationId: 'accepted-job' })
  const input = { prompt: 'original', requestId: randomUUID(), wait: false }
  await runMeiGenGeneration('image', input, client(), config)
  const [scope] = await readdir(process.env.MEIGEN_REQUEST_STORE_DIR)
  const identity = join(process.env.MEIGEN_REQUEST_STORE_DIR, scope, input.requestId, 'identity.json')
  await writeFile(identity, '{invalid')
  let calls = 0; globalThis.fetch = async () => { calls++; throw new Error('unexpected') }
  const output = await runMeiGenGeneration('image', input, client(), config)
  assert.equal(output.error.code, 'invalid_receipt'); assert.equal(calls, 0); assert.equal(await readFile(identity, 'utf8'), '{invalid')
}))

test('a receipt save failure after acceptance preserves success and the server handle', () => isolated(async () => {
  globalThis.fetch = async url => {
    if (String(url).includes('/requests/')) return Response.json({ success: false, code: 'request_not_found' }, { status: 404 })
    await rm(process.env.MEIGEN_REQUEST_STORE_DIR, { recursive: true })
    await writeFile(process.env.MEIGEN_REQUEST_STORE_DIR, 'storage became unavailable')
    return Response.json({ success: true, generationId: 'saved-server-job' })
  }
  const output = await runMeiGenGeneration('image', { prompt: 'submit once', requestId: randomUUID(), wait: false }, client(), config)
  assert.equal(output.success, true); assert.equal(output.generationId, 'saved-server-job'); assert.match(output.receiptWarning, /durable receipts are unavailable/)
}))

test('server observation exhaustion returns processing + observationEnded without claiming failure or refund', () => isolated(async () => {
  globalThis.fetch = async url => String(url).includes('/requests/') ? Response.json({ success: false, code: 'request_not_found' }, { status: 404 })
    : String(url).includes('/status/') ? Response.json({ success: true, status: 'processing', pollHintSeconds: 0, generationId: 'observed-job' })
    : Response.json({ success: true, generationId: 'observed-job' })
  const output = await runMeiGenGeneration('image', { prompt: 'wait', requestId: randomUUID(), download: false }, client(), config)
  assert.equal(output.success, true); assert.equal(output.status, 'processing'); assert.equal(output.observationEnded, true); assert.equal(output.pollAfterSeconds, undefined)
  assert.equal(output.error, undefined); assert.equal(output.generationId, 'observed-job'); assert.match(output.nextAction.message, /not proof of failure or refund/)
}))

test('specific generation failure codes survive status queries and deduped submission results', () => isolated(async () => {
  const failed = { success: true, status: 'failed', generationId: 'failed-job', failureCode: 'content_policy_violation', error: 'Rejected', creditsStatus: 'refunded' }
  globalThis.fetch = async () => Response.json(failed)
  const output = await runMeiGenGeneration('image', { prompt: 'failed request', requestId: randomUUID(), wait: false }, client(), config)
  assert.equal(output.error.code, 'content_policy_violation'); assert.equal(output.creditsStatus, 'refunded')
  const terminal = generationStatusOutput(failed, { pollAfterSeconds: 30, observationEnded: true }); assert.equal(terminal.error.code, 'content_policy_violation'); assert.equal(terminal.pollAfterSeconds, undefined); assert.equal(terminal.observationEnded, undefined)
}))

test('HTTP 402 recovery directs BYOK to its own provider and MeiGen to purchased credits', () => {
  const error = new GenerationError('Payment required', 'http_402', 402, true)
  const byok = errorOutput(error, { provider: 'openai' })
  assert.equal(byok.nextAction.type, 'configure_provider_billing'); assert.doesNotMatch(byok.nextAction.message, /meigen.ai\/profile|same requestId/)
  assert.equal(errorOutput(error, { provider: 'meigen', requestId: randomUUID() }).nextAction.type, 'top_up')
  for (const status of [401, 403]) {
    const auth = errorOutput(new GenerationError('Wrong key', 'auth', status), { provider: 'openai' })
    assert.equal(auth.nextAction.type, 'configure_auth'); assert.doesNotMatch(auth.nextAction.message, /same requestId/)
  }
})

test('streamed result writes publish only complete files and clean partial files after overflow, error or cancellation', () => isolated(async directory => {
  const output = join(directory, 'video.mp4')
  const chunks = [new Uint8Array([1, 2]), new Uint8Array([3, 4])]
  const response = new Response(new ReadableStream({ pull(controller) { const part = chunks.shift(); if (part) controller.enqueue(part); else controller.close() } }))
  response.arrayBuffer = () => { throw new Error('must not buffer whole video') }
  await streamResponseToFile(response, output, 4)
  assert.deepEqual(await readFile(output), Buffer.from([1, 2, 3, 4])); if(process.platform !== 'win32') assert.equal((await stat(output)).mode & 0o777, 0o600)
  await assert.rejects(streamResponseToFile(new Response(''), join(directory, 'empty.mp4'), 4), error => error.code === 'invalid_response')
  assert.deepEqual(await readdir(directory), ['video.mp4'])
  for (const kind of ['overflow', 'error', 'cancel']) {
    const controller = new AbortController(); let step = 0
    const stream = new ReadableStream({ pull(target) {
      if (step++ === 0) return target.enqueue(new Uint8Array([5, 6]))
      if (kind === 'error') return target.error(new Error('network disconnected'))
      if (kind === 'cancel') { controller.abort(); return }
      target.enqueue(new Uint8Array(8)); target.close()
    } })
    await assert.rejects(streamResponseToFile(new Response(stream), join(directory, `${kind}.mp4`), 4, controller.signal))
    assert.deepEqual(await readdir(directory), ['video.mp4'])
  }
}))

test('streamed video timeouts clean partial files and successful generation retains URLs after download failure', () => isolated(async directory => {
  globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])) } }))
  await assert.rejects(withHttpResponse('https://images.meigen.ai/stall.mp4', {}, 10, (response, signal) => streamResponseToFile(response, join(directory, 'stall.mp4'), 10, signal)), /timed out/)
  assert.deepEqual(await readdir(directory), [])
  for (const mode of ['oversized', 'empty']) {
    globalThis.fetch = async url => {
      if (String(url).includes('/requests/')) return Response.json({ success: false, code: 'request_not_found' }, { status: 404 })
      if (String(url).endsWith('/v2')) return Response.json({ success: true, status: 'completed', generationId: 'video-job', mediaType: 'video', videoUrl: 'https://images.meigen.ai/video.mp4' })
      return mode === 'empty' ? new Response('') : new Response(null, { headers: { 'content-length': String(513 * 1024 * 1024) } })
    }
    const output = await runMeiGenGeneration('video', { prompt: 'video', modelId: 'video', requestId: randomUUID() }, client(), config)
    assert.equal(output.success, true); assert.equal(output.generationId, 'video-job'); assert.equal(output.videoUrl, 'https://images.meigen.ai/video.mp4')
    assert.match(output.downloadWarning, mode === 'empty' ? /empty/ : /size limit/); assert.deepEqual(await readdir(process.env.MEIGEN_VIDEO_OUTPUT_DIR), [])
  }
}))

test('an upload failure before submission never tells the caller to check a generation', () => {
  const { preSubmitError } = operationModule
  const { errorOutput } = contractModule
  const { ImageUploadError } = uploadModule
  const expected = { 401: 'configure_auth', 403: 'configure_auth', 402: 'top_up', 400: 'resolve_error', 413: 'resolve_error', 503: 'retry_request', 500: 'retry_request' }
  for (const [status, type] of Object.entries(expected)) {
    const output = errorOutput(preSubmitError(new ImageUploadError(`upload failed ${status}`, Number(status))), { requestId: 'f2c4d7c1-1111-4222-8333-444455556666', provider: 'meigen' })
    assert.equal(output.nextAction.type, type, `status ${status}`)
    assert.notEqual(output.nextAction.type, 'check_generation')
    assert.equal(output.status, 'error')
    assert.equal(output.error.code === 'request_interrupted', false, `status ${status} must not be reported as an interrupted submission`)
  }
  // 非上传错误原样透传
  const plain = new Error('other')
  assert.equal(preSubmitError(plain) instanceof contractModule.GenerationError, true)
  // PUT 403 = 签名 URL / 存储侧拒绝,不是 Key 无效:同 ID 重试上传
  assert.equal(errorOutput(preSubmitError(new ImageUploadError('put denied', 403, 'put')), { requestId: 'f2c4d7c1-1111-4222-8333-444455556666', provider: 'meigen' }).nextAction.type, 'retry_request')
})

test('a missing local reference path never produces a POST or a check_generation hint', () => isolated(async () => {
  const requestId = randomUUID()
  let posts = 0
  globalThis.fetch = async (_url, init) => { if ((init?.method ?? 'GET') === 'POST') posts++; return Response.json({ success: true, generationId: 'never' }) }
  const cases = [
    ['image', { prompt: 'x', referenceImages: ['/nonexistent/meigen-missing.png'], requestId, wait: false }],
    ['video', { prompt: 'x', modelId: 'seedance-2-5', referenceVideos: ['/nonexistent/meigen-missing.mp4'], requestId, wait: false }],
    ['video', { prompt: 'x', modelId: 'seedance-2-5', referenceAudios: ['/nonexistent/meigen-missing.mp3'], requestId, wait: false }],
  ]
  for (const [mediaType, input] of cases) {
    const output = await runMeiGenGeneration(mediaType, input, client(), config)
    assert.equal(output.success, false)
    assert.equal(output.error.code, 'invalid_reference', `${mediaType} ${JSON.stringify(input)}`)
    assert.equal(output.nextAction.type, 'resolve_error')
    assert.notEqual(output.nextAction.type, 'check_generation')
    assert.equal(output.status, 'error')
  }
  assert.equal(posts, 0)
}))

test('cancellation before submission stops without a check_generation hint', () => isolated(async () => {
  let posts = 0
  globalThis.fetch = async (_url, init) => { if ((init?.method ?? 'GET') === 'POST') posts++; return Response.json({ success: true, generationId: 'never' }) }
  const output = await runMeiGenGeneration('image', { prompt: 'x', requestId: randomUUID(), wait: false }, client(), config, AbortSignal.abort())
  assert.equal(output.error.code, 'cancelled')
  assert.equal(output.nextAction.type, 'retry_request')
  assert.equal(posts, 0)
}))

/** 最小合法 mp4 容器头:detectReferenceMedia 只看 bytes[4..8] === 'ftyp'。 */
const tinyMp4 = () => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.from([0, 0, 0, 0]), Buffer.from('isom'), Buffer.alloc(8)])

test('presign timeout and invalid JSON before submission retry with the same requestId, never check_generation', () => isolated(async directory => {
  const clip = join(directory, 'clip.mp4'); await writeFile(clip, tinyMp4())
  const input = () => ({ prompt: 'x', modelId: 'seedance-2-5', referenceVideos: [clip], requestId: randomUUID(), wait: false })
  let generatePosts = 0
  const isGenerate = url => String(url).includes('/api/generate/v2') && !String(url).includes('/requests/')
  // 显式 requestId 会先查一次服务端回执:这里按「从未提交」回 404,让流程进入上传阶段
  const notFound = () => Response.json({ success: false, code: 'request_not_found' }, { status: 404 })
  // 1) 真实超时:presign 的 fetch 永不返回,由 withHttpResponse 自己的 20s 计时器中止(用 mock timers 拨快)
  let presignSeen; const presignStarted = new Promise(resolve => { presignSeen = resolve })
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    globalThis.fetch = (url, init) => {
      if (String(url).includes('/requests/')) return Promise.resolve(notFound())
      if (isGenerate(url)) { generatePosts++; return Promise.resolve(Response.json({ success: true, generationId: 'never' })) }
      presignSeen()
      return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))
    }
    const pending = runMeiGenGeneration('video', input(), client(), config)
    await presignStarted
    mock.timers.tick(30_000)
    const timedOut = await pending
    assert.equal(timedOut.success, false)
    assert.equal(['pre_submit_failed', 'upload_failed'].includes(timedOut.error.code), true, timedOut.error.code)
    assert.equal(timedOut.nextAction.type, 'retry_request')
    assert.equal(timedOut.status, 'error')
  } finally { mock.timers.reset() }
  // 2) presign 回了非 JSON
  globalThis.fetch = async url => {
    if (String(url).includes('/requests/')) return notFound()
    if (isGenerate(url)) { generatePosts++; return Response.json({ success: true, generationId: 'never' }) }
    return new Response('<html>oops</html>', { status: 200, headers: { 'content-type': 'text/html' } })
  }
  const badJson = await runMeiGenGeneration('video', input(), client(), config)
  assert.equal(badJson.success, false)
  assert.equal(['pre_submit_failed', 'upload_failed'].includes(badJson.error.code), true, badJson.error.code)
  assert.equal(badJson.nextAction.type, 'retry_request')
  assert.notEqual(badJson.nextAction.type, 'check_generation')
  assert.equal(generatePosts, 0)
}))

test('media uploads hold at most two clips in memory at once, even across concurrent tasks', () => isolated(async directory => {
  const { fingerprintMediaReferences, uploadMediaReferences } = referencesModule
  const clips = []
  for (let i = 0; i < 3; i++) { const path = join(directory, `clip-${i}.mp4`); await writeFile(path, Buffer.concat([tinyMp4(), Buffer.from([i])])); clips.push(path) }
  let inFlight = 0; let peak = 0
  globalThis.fetch = async (url, init) => {
    if (init?.method === 'PUT') {
      inFlight++; peak = Math.max(peak, inFlight)
      await new Promise(resolve => setTimeout(resolve, 20))
      inFlight--
      return new Response(null, { status: 200 })
    }
    return Response.json({ success: true, presignedUrl: 'https://upload.example/put', publicUrl: `https://images.meigen.ai/ref-videos/${randomUUID()}.mp4` })
  }
  const references = await fingerprintMediaReferences(clips, 'video')
  // 两个并行任务、共 6 段:PUT 同时在途的从不超过 2
  const [a, b] = await Promise.all([
    uploadMediaReferences(references, 'seedance-2-5', config),
    uploadMediaReferences(references, 'seedance-2-5', config),
  ])
  assert.equal(a.length, 3); assert.equal(b.length, 3)
  assert.equal(peak <= 2, true, `peak in-flight PUTs was ${peak}`)
  assert.equal(peak >= 1, true)
}))

/** 证明两个上传槽都在:两段并行上传的 PUT 在途峰值必须到 2,且在有限时间内完成(漏槽会卡住或只到 1)。 */
async function assertMediaUploadSlotsFree(directory, config) {
  const { fingerprintMediaReferences, uploadMediaReferences } = referencesModule
  const clips = []
  for (let i = 0; i < 2; i++) { const path = join(directory, `probe-${i}-${randomUUID()}.mp4`); await writeFile(path, Buffer.concat([tinyMp4(), Buffer.from([i])])); clips.push(path) }
  let inFlight = 0; let peak = 0
  globalThis.fetch = async (url, init) => {
    if (init?.method === 'PUT') {
      inFlight++; peak = Math.max(peak, inFlight)
      await new Promise(resolve => setTimeout(resolve, 20))
      inFlight--
      return new Response(null, { status: 200 })
    }
    return Response.json({ success: true, presignedUrl: 'https://upload.example/put', publicUrl: `https://images.meigen.ai/ref-videos/${randomUUID()}.mp4` })
  }
  const references = await fingerprintMediaReferences(clips, 'video')
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('media upload permits were not released')), 3000))
  await Promise.race([Promise.all([uploadMediaReferences([references[0]], 'seedance-2-5', config), uploadMediaReferences([references[1]], 'seedance-2-5', config)]), timeout])
  assert.equal(peak, 2, 'both upload permits must be available')
}

test('a PUT timeout before submission retries with the same requestId and releases its upload permit', () => isolated(async directory => {
  const clip = join(directory, 'clip.mp4'); await writeFile(clip, tinyMp4())
  let generatePosts = 0
  let putSeen; const putStarted = new Promise(resolve => { putSeen = resolve })
  mock.timers.enable({ apis: ['setTimeout'] })
  let output
  try {
    globalThis.fetch = (url, init) => {
      if (String(url).includes('/requests/')) return Promise.resolve(Response.json({ success: false, code: 'request_not_found' }, { status: 404 }))
      if (String(url).includes('/api/generate/v2')) { generatePosts++; return Promise.resolve(Response.json({ success: true, generationId: 'never' })) }
      if (init?.method === 'PUT') { putSeen(); return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })) }
      return Promise.resolve(Response.json({ success: true, presignedUrl: 'https://upload.example/put', publicUrl: 'https://images.meigen.ai/ref-videos/x.mp4' }))
    }
    const pending = runMeiGenGeneration('video', { prompt: 'x', modelId: 'seedance-2-5', referenceVideos: [clip], requestId: randomUUID(), wait: false }, client(), config)
    await putStarted
    // uploadReferenceMedia 给大文件 PUT 的是 300s 窗口:拨过它,走真实的 withHttpResponse 超时路径
    mock.timers.tick(300_001)
    output = await pending
  } finally { mock.timers.reset() }
  assert.equal(output.success, false)
  assert.equal(['pre_submit_failed', 'upload_failed'].includes(output.error.code), true, output.error.code)
  assert.equal(output.nextAction.type, 'retry_request')
  assert.equal(generatePosts, 0)
  await assertMediaUploadSlotsFree(directory, config)
}))

test('cancelling an upload that holds a permit, and a failed PUT, both hand the permit back', () => isolated(async directory => {
  const { fingerprintMediaReferences, uploadMediaReferences } = referencesModule
  const clip = join(directory, 'clip.mp4'); await writeFile(clip, tinyMp4())
  const references = await fingerprintMediaReferences([clip], 'video')
  // 1) 持槽期间被取消:PUT 挂起,调用方 abort
  const controller = new AbortController()
  let putSeen; const putStarted = new Promise(resolve => { putSeen = resolve })
  globalThis.fetch = (url, init) => {
    if (init?.method === 'PUT') { putSeen(); return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })) }
    return Promise.resolve(Response.json({ success: true, presignedUrl: 'https://upload.example/put', publicUrl: 'https://images.meigen.ai/ref-videos/x.mp4' }))
  }
  const cancelled = uploadMediaReferences(references, 'seedance-2-5', config, controller.signal)
  await putStarted
  controller.abort()
  await assert.rejects(cancelled, error => error?.name === 'AbortError')
  await assertMediaUploadSlotsFree(directory, config)
  // 2) PUT 失败(存储侧 500)
  globalThis.fetch = async (url, init) => init?.method === 'PUT'
    ? new Response('storage error', { status: 500 })
    : Response.json({ success: true, presignedUrl: 'https://upload.example/put', publicUrl: 'https://images.meigen.ai/ref-videos/x.mp4' })
  await assert.rejects(uploadMediaReferences(references, 'seedance-2-5', config), error => error instanceof uploadModule.ImageUploadError && error.status === 500 && error.stage === 'put')
  await assertMediaUploadSlotsFree(directory, config)
}))

test('30 local image fingerprints retain only metadata, enforce a shared byte budget and preserve hashes', () => isolated(async directory => {
  const { fingerprintReferences, fingerprintMediaReferences, localReferenceBudget } = referencesModule
  const files = []
  for (let i = 0; i < 30; i++) {
    const path = join(directory, `large-${i}.png`)
    await writeFile(path, Buffer.from([i])); await truncate(path, 8 * 1024 * 1024); files.push(path)
  }
  const budget = localReferenceBudget()
  const references = await fingerprintReferences(files, undefined, budget)
  assert.equal(references.length, 30)
  for (const r of references) {
    assert.deepEqual(Object.keys(r).sort(), ['identity', 'name', 'path', 'size'])
    assert.equal(r.size, 8 * 1024 * 1024); assert.match(r.identity, /^[0-9a-f]{64}$/)
  }
  const clip = join(directory, 'extra.mp4'); await writeFile(clip, tinyMp4()); await truncate(clip, 20 * 1024 * 1024)
  await assert.rejects(fingerprintMediaReferences([clip], 'video', undefined, budget), /256 MiB combined/)
  await assert.rejects(fingerprintReferences([...files, ...files.slice(0, 3)]), /256 MiB combined/)
}))

test('deferred image uploads detect same-size edits and file growth before upload', () => isolated(async directory => {
  const { fingerprintReferences, uploadReferences } = referencesModule
  const image = join(directory, 'ref.png'); await writeFile(image, Buffer.from('original'))
  const refs = await fingerprintReferences([image])
  globalThis.fetch = async () => { assert.fail('A changed file must not be uploaded') }
  await writeFile(image, Buffer.from('modified'))
  await assert.rejects(uploadReferences(refs, config), e => e.code === 'reference_changed')
  await truncate(image, 512 * 1024 * 1024)
  await assert.rejects(uploadReferences(refs, config), e => e.code === 'reference_changed')
  const controller = new AbortController(); controller.abort()
  await assert.rejects(fingerprintReferences([image], controller.signal))
}))
