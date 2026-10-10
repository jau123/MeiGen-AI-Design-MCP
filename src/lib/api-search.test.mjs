import test from 'node:test'
import assert from 'node:assert/strict'
import apiModule from './api-search.js'

const { apiSearchPosts } = apiModule
const snapshot = '11111111-2222-4333-8444-555555555555'
const search = (signal, snapshotId) => apiSearchPosts('https://www.meigen.ai', 'product photo', 3, snapshotId ? 3 : 0, undefined, snapshotId, signal)

test('already cancelled searches do not dispatch HTTP and return a distinct cancelled result', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', () => { calls++; throw new Error('Unexpected dispatch') })
  const controller = new AbortController()
  controller.abort()
  assert.deepEqual(await search(controller.signal), { kind: 'cancelled' })
  assert.deepEqual(await search(controller.signal, snapshot), { kind: 'cancelled' })
  assert.equal(calls, 0)
})

test('caller cancellation aborts a pending snapshot request without classifying it as unavailable', async t => {
  const controller = new AbortController()
  let requestSignal
  t.mock.method(globalThis, 'fetch', (url, { signal }) => new Promise((resolve, reject) => {
    requestSignal = signal
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  const pending = search(controller.signal, snapshot)
  controller.abort(new DOMException('User cancelled', 'AbortError'))
  assert.deepEqual(await pending, { kind: 'cancelled' })
  assert.equal(requestSignal.aborted, true)
})

for (const status of [200, 429]) {
  test(`cancellation while consuming HTTP ${status} takes precedence over response handling`, async t => {
    const controller = new AbortController()
    t.mock.method(globalThis, 'fetch', async () => ({
      status, ok: status === 200,
      async json() {
        controller.abort()
        if (status === 429) throw controller.signal.reason
        return { success: true, data: [] }
      },
    }))
    assert.deepEqual(await search(controller.signal), { kind: 'cancelled' })
  })
}

test('an internal network timeout remains an availability error, not caller cancellation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const controller = new AbortController()
  t.mock.method(globalThis, 'fetch', (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  const pending = search(controller.signal)
  t.mock.timers.tick(8000)
  assert.deepEqual(await pending, { kind: 'unavailable' })
  assert.equal(controller.signal.aborted, false)
})
