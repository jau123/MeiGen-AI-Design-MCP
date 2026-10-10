import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { createServer } from 'node:http'
import apiModule from './meigen-api.js'

const { MeiGenApiClient } = apiModule
const client = () => new MeiGenApiClient({ meigenBaseUrl: 'https://www.meigen.ai', meigenApiToken: 'private-fixture' })
const image = { id: 'source/id', text: 'A public gallery prompt', media_urls: ['https://images.meigen.ai/source.png'] }

test('image details encode IDs, forbid redirects and never send the configured legacy key', async t => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://www.meigen.ai/api/images/source%2Fid')
    assert.equal(init.redirect, 'error')
    assert.equal(init.headers, undefined)
    assert(init.signal instanceof AbortSignal)
    return Response.json({ success: true, data: image })
  })
  assert.deepEqual(await client().getImageDetails(image.id), image)
})

test('a real redirect is rejected without requesting the destination', async t => {
  const requests = []
  const server = createServer((req, res) => {
    requests.push(req.url)
    res.writeHead(302, { Location: '/redirect-destination' }).end()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)) })
  const api = new MeiGenApiClient({ meigenBaseUrl: `http://127.0.0.1:${server.address().port}` })
  await assert.rejects(api.getImageDetails('redirect'), /fetch failed/)
  assert.deepEqual(requests, ['/api/images/redirect'])
})

test('image detail headers have an eight-second deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let receivedSignal
  t.mock.method(globalThis, 'fetch', (url, { signal }) => new Promise((resolve, reject) => {
    receivedSignal = signal
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  const pending = assert.rejects(client().getImageDetails('slow-headers'), error => error.code === 'request_timeout')
  t.mock.timers.tick(8000)
  await pending
  assert.equal(receivedSignal.aborted, true)
})

test('the same deadline also cancels a stalled body and does not wait for upstream cleanup', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let cancelled = false
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"success":')); },
    cancel() { cancelled = true; return new Promise(() => {}) },
  })))
  const pending = assert.rejects(client().getImageDetails('slow-body'), error => error.code === 'request_timeout')
  await setImmediate()
  t.mock.timers.tick(8000)
  await pending
  assert.equal(cancelled, true)
})

test('image detail cancellation prevents dispatch or stops the in-flight body', async t => {
  const controller = new AbortController()
  let calls = 0, cancelled = false
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return new Response(new ReadableStream({ cancel() { cancelled = true } }))
  })
  controller.abort(new DOMException('User cancelled', 'AbortError'))
  await assert.rejects(client().getImageDetails('pre-cancelled', controller.signal), { name: 'AbortError' })
  assert.equal(calls, 0)
  const active = new AbortController()
  const pending = assert.rejects(client().getImageDetails('active', active.signal), { name: 'AbortError' })
  await setImmediate()
  active.abort(new DOMException('User cancelled', 'AbortError'))
  await pending
  assert.equal(calls, 1)
  assert.equal(cancelled, true)
})

for (const declared of [true, false]) {
  test(`image details reject more than 2 MiB with ${declared ? 'declared' : 'streamed'} size`, async t => {
    let cancelled = false
    t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
      start(controller) { if (!declared) controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)) },
      cancel() { cancelled = true; return new Promise(() => {}) },
    }), { headers: declared ? { 'Content-Length': String(2 * 1024 * 1024 + 1) } : {} }))
    await assert.rejects(client().getImageDetails('large'), error => error.code === 'download_too_large')
    assert.equal(cancelled, true)
  })
}

test('image details distinguish not-found, malformed responses and server errors', async t => {
  const bodies = [new Response('not found', { status: 404 }), new Response('{invalid json'), Response.json({ error: 'Unavailable' }, { status: 503 })]
  t.mock.method(globalThis, 'fetch', async () => bodies.shift())
  assert.equal(await client().getImageDetails('missing'), null)
  await assert.rejects(client().getImageDetails('invalid'), error => error.code === 'invalid_response')
  await assert.rejects(client().getImageDetails('unavailable'), error => error.httpStatus === 503)
})
