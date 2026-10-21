import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
// These sources compile to CJS. Use one loader/cache on Node 20 as in the shipped runtime.
const require = createRequire(import.meta.url)
const apiModule = require('../lib/meigen-api.ts')
const operationModule = require('../lib/generation-operation.ts')
const contractModule = require('../lib/generation-contract.ts')
const checkModule = require('./check-generation.ts')
const { MeiGenApiClient } = apiModule
const { runMeiGenGeneration, generationStatusOutput } = operationModule
const { GenerationError, generationResult } = contractModule
const config = { meigenBaseUrl: 'https://mock.example', meigenApiToken: 'test-only-key' }

test('video failures preserve finite corrective details and confirmed refund state', () => {
  for (const failureDetail of ['video_edit_duration', 'reference_video_frame_rate']) {
    const output = generationStatusOutput({ status: 'failed', mediaType: 'video', failureCode: 'invalid_request', failureDetail,
      creditsStatus: 'refunded', error: 'Safe corrective guidance' }, { requestId: 'same-request' })
    assert.equal(output.failureDetail, failureDetail)
    assert.equal(output.creditsStatus, 'refunded')
    assert.equal(output.nextAction.type, 'review_failure')
    assert.equal(output.error.retryable, false)
  }
  const unknown = generationStatusOutput({ status: 'failed', failureCode: 'invalid_request', failureDetail: 'unrecognized-private-text' }, {})
  assert.equal(unknown.failureDetail, undefined)
})
const client = () => new MeiGenApiClient(config)
const ready = { success: true, status: 'completed', generationId: 'accepted-job', mediaType: 'image', imageUrl: 'https://images.meigen.ai/result.png' }
const missing = () => Response.json({ success: false, code: 'request_not_found' }, { status: 404 })
const realSetTimeout = globalThis.setTimeout
const flush = () => new Promise(resolve => setImmediate(resolve))
async function until(predicate) { for (let i = 0; i < 500 && !predicate(); i++) await new Promise(resolve => realSetTimeout(resolve, 1)); await flush(); assert.ok(predicate(), 'expected asynchronous state was reached') }
async function advance(t, milliseconds) { t.mock.timers.tick(milliseconds); await flush() }
async function isolated(run) {
  const directory = await mkdtemp(join(tmpdir(), 'meigen-observation-'))
  const originalFetch = globalThis.fetch
  const originalStore = process.env.MEIGEN_REQUEST_STORE_DIR
  process.env.MEIGEN_REQUEST_STORE_DIR = join(directory, 'receipts')
  try { await run() } finally {
    globalThis.fetch = originalFetch
    if (originalStore === undefined) delete process.env.MEIGEN_REQUEST_STORE_DIR
    else process.env.MEIGEN_REQUEST_STORE_DIR = originalStore
    await rm(directory, { recursive: true, force: true })
  }
}
function checkTool() {
  let handler
  checkModule.registerCheckGeneration({ registerTool: (_name, _schema, fn) => { handler = fn } }, client())
  return args => handler(args, {})
}
function fakeClock(t) { t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_800_000_000_000 }) }

test('MeiGen wait retries transient observation only, resets errors, and honors Retry-After', t => isolated(async () => {
  fakeClock(t)
  const requestId = randomUUID(); let posts = 0; let polls = 0
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/requests/')) return missing()
    if (init.method === 'POST') { posts++; return Response.json({ success: true, generationId: ready.generationId }) }
    polls++
    if (polls === 1) return Response.json({ error: 'gateway', retryable: true }, { status: 502 })
    if (polls === 2) return Response.json({ status: 'processing' })
    if (polls === 3) return Response.json({ error: 'slow down' }, { status: 429, headers: { 'Retry-After': '7' } })
    return Response.json(ready)
  }
  const pending = runMeiGenGeneration('image', { prompt: 'retry observation', requestId, download: false }, client(), config)
  await until(() => polls === 1)
  await advance(t, 2999); assert.equal(polls, 1)
  await advance(t, 1); assert.equal(polls, 2)
  await advance(t, 3000); assert.equal(polls, 3)
  await advance(t, 6999); assert.equal(polls, 3)
  await advance(t, 1)
  const result = await pending
  assert.equal(result.status, 'completed'); assert.equal(result.requestId, requestId)
  assert.equal(result.generationId, ready.generationId); assert.equal(polls, 4); assert.equal(posts, 1)
}))

test('three consecutive status errors stop observation with original IDs and no replacement POST', t => isolated(async () => {
  fakeClock(t)
  let polls = 0; let posts = 0; const requestId = randomUUID()
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/requests/')) return missing()
    if (init.method === 'POST') { posts++; return Response.json({ success: true, generationId: ready.generationId }) }
    polls++; return Response.json({ error: 'gateway', code: 'upstream_busy' }, { status: 503 })
  }
  const pending = runMeiGenGeneration('image', { prompt: 'stop safely', requestId, download: false }, client(), config)
  await until(() => polls === 1); await advance(t, 3000); await advance(t, 6000)
  const result = await pending
  assert.equal(polls, 3); assert.equal(posts, 1); assert.equal(result.status, 'unknown')
  assert.equal(result.error.code, 'upstream_busy'); assert.equal(result.requestId, requestId)
  assert.equal(result.generationId, ready.generationId); assert.equal(result.nextAction.type, 'check_generation')
}))

test('valid processing polls reset the consecutive-error limit', t => isolated(async () => {
  fakeClock(t); let polls = 0
  globalThis.fetch = async () => {
    polls++
    if ([1, 2, 4, 5].includes(polls)) throw new TypeError('fetch failed')
    return Response.json(polls === 3 ? { status: 'processing' } : ready)
  }
  const pending = client().waitForGeneration('accepted-job', 60_000)
  await flush()
  for (const delay of [3000, 6000, 3000, 3000, 6000]) await advance(t, delay)
  assert.equal((await pending).status, 'completed'); assert.equal(polls, 6)
}))

test('per-query timeout is retryable inside the total observation budget', t => isolated(async () => {
  fakeClock(t); let polls = 0
  globalThis.fetch = (_url, init) => {
    polls++
    if (polls === 1) return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))
    return Promise.resolve(Response.json(ready))
  }
  const pending = client().waitForGeneration('accepted-job', 60_000)
  await advance(t, 15_000); assert.equal(polls, 1)
  await advance(t, 3000); assert.equal((await pending).status, 'completed'); assert.equal(polls, 2)
}))

test('HTTP-date Retry-After is honored and cannot outlive the total wait budget', t => isolated(async () => {
  fakeClock(t); let polls = 0
  globalThis.fetch = async () => { polls++; return Response.json({ error: 'later' }, { status: 429, headers: { 'Retry-After': new Date(Date.now() + 60_000).toUTCString() } }) }
  const pending = client().waitForGeneration('accepted-job', 1000)
  const rejected = assert.rejects(pending, error => error.code === 'polling_interrupted')
  await flush(); await advance(t, 999); assert.equal(polls, 1)
  await advance(t, 1); await rejected; assert.equal(polls, 1)
}))

test('total wait budget also cancels an in-flight status query', t => isolated(async () => {
  fakeClock(t); let polls = 0; let aborted = false
  globalThis.fetch = (_url, init) => {
    polls++
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => { aborted = true; reject(init.signal.reason) }, { once: true }))
  }
  const rejected = assert.rejects(client().waitForGeneration('accepted-job', 100), error => error.code === 'polling_interrupted')
  await advance(t, 100); await rejected; assert.equal(polls, 1); assert.equal(aborted, true)
}))

test('terminal HTTP errors and provider failure do not retry', () => isolated(async () => {
  for (const status of [401, 403, 404, 410]) {
    let polls = 0
    globalThis.fetch = async () => { polls++; return Response.json({ error: 'terminal', retryable: true }, { status }) }
    await assert.rejects(client().waitForGeneration('accepted-job'), error => error.httpStatus === status)
    assert.equal(polls, 1)
  }
  let polls = 0
  globalThis.fetch = async () => { polls++; return Response.json({ status: 'failed', failureCode: 'content_policy_violation' }) }
  assert.equal((await client().waitForGeneration('accepted-job')).failureCode, 'content_policy_violation'); assert.equal(polls, 1)
}))

test('caller cancellation stops preflight, status HTTP, and retry backoff', t => isolated(async () => {
  fakeClock(t)
  const already = new AbortController(); already.abort(); let polls = 0
  globalThis.fetch = async () => { polls++; return Response.json(ready) }
  await assert.rejects(client().waitForGeneration('accepted-job', 60_000, undefined, already.signal), error => error.name === 'AbortError')
  assert.equal(polls, 0)
  for (const mode of ['inflight', 'backoff']) {
    const controller = new AbortController(); polls = 0
    globalThis.fetch = (_url, init) => {
      polls++
      return mode === 'backoff' ? Promise.resolve(Response.json({ error: 'gateway' }, { status: 502 }))
        : new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))
    }
    const rejected = assert.rejects(client().waitForGeneration('accepted-job', 60_000, undefined, controller.signal), error => error.name === 'AbortError')
    await flush(); controller.abort(); await rejected; await advance(t, 10_000); assert.equal(polls, 1)
  }
}))

test('unknown recovery 404 never permits a paid POST or same-ID resubmit guidance', () => isolated(async () => {
  for (const response of [
    () => new Response('<html>Not Found</html>', { status: 404 }),
    () => new Response(null, { status: 404 }),
    () => Response.json({ success: false, code: 'not_found' }, { status: 404 }),
    () => Response.json({ success: true, code: 'request_not_found' }, { status: 404 }),
  ]) {
    const requestId = randomUUID(); const methods = []
    globalThis.fetch = async (_url, init) => { methods.push(init.method ?? 'GET'); return response() }
    const result = await runMeiGenGeneration('image', { prompt: 'do not duplicate', requestId, wait: false }, client(), config)
    assert.equal(result.requestId, requestId); assert.equal(result.status, 'unknown')
    assert.equal(result.error.code, 'endpoint_unavailable'); assert.equal(result.error.retryable, false)
    assert.equal(result.nextAction.type, 'check_backend'); assert.deepEqual(methods, ['GET'])
    const checked = (await checkTool()({ requestId })).structuredContent
    assert.equal(checked.nextAction.type, 'check_backend'); assert.equal(checked.requestId, requestId)
  }
}))

test('missing recovery endpoint preserves a saved task and known generation-ID status remains usable', () => isolated(async () => {
  const requestId = randomUUID(); const input = { prompt: 'existing charge', requestId, wait: false }; let posts = 0
  globalThis.fetch = async (url, init) => {
    if (init.method === 'POST') { posts++; return Response.json({ success: true, generationId: ready.generationId }) }
    return posts ? new Response('<html>old deployment</html>', { status: 404 }) : missing()
  }
  assert.equal((await runMeiGenGeneration('image', input, client(), config)).success, true)
  const recovered = await runMeiGenGeneration('image', input, client(), config)
  assert.equal(recovered.error.code, 'endpoint_unavailable'); assert.equal(recovered.nextAction.type, 'check_backend'); assert.equal(posts, 1)
  globalThis.fetch = async url => { assert.match(String(url), /\/status\/accepted-job$/); return Response.json(ready) }
  assert.equal((await checkTool()({ generationId: ready.generationId })).structuredContent.status, 'completed')
}))

test('only explicit backend request_not_found permits exact-ID recovery submission', () => isolated(async () => {
  const requestId = randomUUID(); const methods = []
  globalThis.fetch = async (_url, init) => {
    methods.push(init.method ?? 'GET')
    if (init.method !== 'POST') return missing()
    assert.equal(JSON.parse(init.body).idempotencyKey, requestId)
    return Response.json({ success: true, generationId: ready.generationId })
  }
  assert.equal((await checkTool()({ requestId })).structuredContent.nextAction.type, 'retry_request')
  const result = await runMeiGenGeneration('image', { prompt: 'original', requestId, wait: false }, client(), config)
  assert.equal(result.generationId, ready.generationId); assert.deepEqual(methods, ['GET', 'GET', 'POST'])
}))

test('media mismatch preserves original intent through initial status, waiting, and terminal dedupe', () => isolated(async () => {
  for (const requested of ['image', 'video']) {
    const actual = requested === 'image' ? 'video' : 'image'
    const terminal = { ...ready, mediaType: actual, ...(actual === 'video' ? { videoUrl: 'https://images.meigen.ai/result.mp4' } : {}) }
    for (const mode of ['wait', 'submit-only', 'recovered']) {
      let posts = 0
      globalThis.fetch = async (url, init) => {
        if (String(url).includes('/requests/')) return mode === 'recovered' ? Response.json(terminal) : missing()
        if (init.method === 'POST') { posts++; return Response.json(mode === 'wait' ? { success: true, generationId: ready.generationId, mediaType: actual, status: 'processing' } : { ...terminal, deduped: true }) }
        return Response.json(terminal)
      }
      const body = await runMeiGenGeneration(requested, { prompt: 'model mismatch', modelId: 'explicit-model', requestId: randomUUID(), wait: mode === 'wait', download: false }, client(), config)
      assert.equal(body.success, true); assert.equal(generationResult(body).isError, undefined)
      assert.equal(body.requestedMediaType, requested); assert.equal(body.mediaType, actual)
      assert.equal(body.nextAction.type, 'review_media_type'); assert.match(body.nextAction.message, /Do not automatically submit/)
      assert.equal(body.urls[0], actual === 'video' ? terminal.videoUrl : terminal.imageUrl)
      assert.equal(posts, mode === 'recovered' ? 0 : 1)
    }
  }
  const body = generationStatusOutput(ready, { mediaType: 'image', requestedMediaType: 'video' })
  assert.equal(body.nextAction.type, 'review_media_type')
  assert.equal(generationStatusOutput(ready, { requestedMediaType: 'image' }).nextAction.type, 'use_result')
  assert.equal(generationStatusOutput(ready, {}).nextAction.type, 'use_result')
}))
