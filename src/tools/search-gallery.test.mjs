import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import galleryModule from './search-gallery.js'
const { registerSearchGallery, searchGallerySchema } = galleryModule

/** Register the tool and hand back both the schema-validating entry and the raw handler. */
function searchTool(config) {
  let handler
  let description
  registerSearchGallery({ tool: (...args) => { description = args[1]; handler = args.at(-1) } }, config)
  const schema = z.object(searchGallerySchema)
  return { description, handler, run: args => handler(schema.parse(args)) }
}

test('semantic search negotiates matched media and renders the returned image index', async () => {
  let handler
  registerSearchGallery({ tool: (...args) => { handler = args.at(-1) } }, { meigenBaseUrl: 'https://test.invalid' })
  const previous = globalThis.fetch
  globalThis.fetch = async input => {
    const url = new URL(input)
    assert.equal(url.searchParams.get('media'), 'matched-v1')
    assert.equal(url.searchParams.get('offset'), '40')
    return Response.json({ success: true, data: [{ id: 'hit', text: 'poster', likes: 2, views: 10,
      thumbnail_url: 'https://images.meigen.ai/first-thumb.jpg', media_urls: ['https://images.meigen.ai/first.jpg','https://images.meigen.ai/second.jpg'], matched_media_index: 1 }] })
  }
  try {
    const result = await handler({ query: 'poster', limit: 3, offset: 40 })
    assert.match(result.content[0].text, /second\.jpg/)
    assert.doesNotMatch(result.content[0].text, /first-thumb\.jpg/)
  } finally { globalThis.fetch = previous }
})

test('a limit written against the old maximum is clamped, not rejected by the schema', async () => {
  const { run, description } = searchTool({ meigenBaseUrl: 'https://test.invalid' })
  const previous = globalThis.fetch
  const requested = []
  globalThis.fetch = async input => {
    requested.push(new URL(input).searchParams.get('limit'))
    return Response.json({ success: true, data: Array.from({ length: 3 }, (_, index) => ({
      id: `hit-${index}`, text: 'poster', likes: 0, views: 0, thumbnail_url: `t-${index}.jpg`, media_urls: null })) })
  }
  try {
    // 旧自动化传 5 / 10:schema 必须接受,否则调用方在工具运行前就拿到无法恢复的 schema error。
    const result = await run({ query: 'poster', limit: 10 })
    assert.deepEqual(requested, ['3'])
    assert.match(result.content[0].text, /Found 3 results/)
    assert.deepEqual(z.object(searchGallerySchema).parse({ limit: 5 }).limit, 5)
    assert.throws(() => z.object(searchGallerySchema).parse({ limit: 21 }))
    assert.match(description, /at most 3/)
    assert.match(description, /daily search quota/)
  } finally { globalThis.fetch = previous }
})

test('blank and category requests use the live gallery rather than bundled picks', async () => {
  const { run } = searchTool({ meigenBaseUrl: 'https://test.invalid' })
  const previous = globalThis.fetch
  const queries = []
  globalThis.fetch = async input => {
    const url = new URL(input)
    queries.push(url.searchParams.get('q'))
    assert.equal(url.searchParams.get('limit'), '3')
    return Response.json({ success: true, data: [] })
  }
  try {
    await run({ limit: 10 })
    await run({ query: 'portrait', category: 'Photography', limit: 10 })
    assert.deepEqual(queries, ['creative image inspiration', 'portrait Photography'])
  } finally { globalThis.fetch = previous }
})

test('empty and unavailable live results do not silently fall back to stale local data', async () => {
  const { run } = searchTool({ meigenBaseUrl: 'https://test.invalid' })
  const previous = globalThis.fetch
  try {
    globalThis.fetch = async () => Response.json({ success: true, data: [] })
    const empty = await run({ query: 'portrait' })
    assert.match(empty.content[0].text, /No results/)
    assert.equal(empty.isError, undefined)
    globalThis.fetch = async () => { throw new TypeError('network unavailable') }
    const failed = await run({ query: 'portrait' })
    assert.equal(failed.isError, true)
    assert.match(failed.content[0].text, /online gallery is unavailable/)
    assert.doesNotMatch(failed.content[0].text, /Found \d+ results/)
  } finally { globalThis.fetch = previous }
})

test('a configured MeiGen key authenticates the search so the quota lands on the account', async () => {
  const previous = globalThis.fetch
  const seen = []
  globalThis.fetch = async (input, init) => {
    seen.push(new Headers(init?.headers).get('Authorization'))
    return Response.json({ success: true, data: [{ id: 'hit', text: 'poster', likes: 1, views: 1, thumbnail_url: 'a.jpg', media_urls: null }] })
  }
  try {
    await searchTool({ meigenBaseUrl: 'https://test.invalid', meigenApiToken: 'meigen_sk_test_not_a_real_credential' }).run({ query: 'poster' })
    await searchTool({ meigenBaseUrl: 'https://test.invalid' }).run({ query: 'poster' })
    assert.deepEqual(seen, ['Bearer meigen_sk_test_not_a_real_credential', null])
  } finally { globalThis.fetch = previous }
})

test('an account daily-limit 429 says when it resets without fabricated fallback results', async () => {
  const { run } = searchTool({ meigenBaseUrl: 'https://test.invalid', meigenApiToken: 'meigen_sk_test' })
  const previous = globalThis.fetch
  globalThis.fetch = async () => Response.json({ success: false, error: 'Daily search limit reached', code: 'DAILY_LIMIT_REACHED' }, { status: 429 })
  try {
    const result = await run({ query: 'portrait', limit: 3 })
    assert.match(result.content[0].text, /resets at 00:00 UTC/)
    assert.doesNotMatch(result.content[0].text, /retry in about a minute/)
    assert.equal(result.isError, true)
    assert.doesNotMatch(result.content[0].text, /Found \d+ results/)
  } finally { globalThis.fetch = previous }
})

test('an anonymous per-IP 429 keeps the one-minute wording and no bundled fallback', async () => {
  const { run } = searchTool({ meigenBaseUrl: 'https://test.invalid' })
  const previous = globalThis.fetch
  globalThis.fetch = async () => Response.json({ success: false, error: 'Too many requests' }, { status: 429 })
  try {
    const result = await run({ query: 'portrait', limit: 3 })
    assert.match(result.content[0].text, /retry in about a minute/)
    assert.doesNotMatch(result.content[0].text, /Found \d+ results/)
  } finally { globalThis.fetch = previous }
})

test('caps over-returned API rows and returns a standard image for each selected match', async () => {
  const sharp = (await import('sharp')).default
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ff6600' } }).png().toBuffer()
  const previous = globalThis.fetch, assets = []
  globalThis.fetch = async (input, init) => {
    const url = new URL(input)
    if (url.hostname === 'images.meigen.ai') {
      assert.equal(new Headers(init?.headers).get('authorization'), null)
      assets.push(url.href)
      return new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/png' } })
    }
    return Response.json({ success: true, data: Array.from({ length: 10 }, (_, i) => ({ id: `hit-${i}`, text: 'poster', likes: 0, views: 0,
      thumbnail_url: `https://images.meigen.ai/first-${i}.png`, media_urls: [`https://images.meigen.ai/first-${i}.png`, `https://images.meigen.ai/hit-${i}.png`], matched_media_index: 1 })) })
  }
  try {
    const { run } = searchTool({ meigenBaseUrl: 'https://test.invalid', meigenApiToken: 'meigen_sk_fixture' })
    const result = await run({ query: 'poster', limit: 10 })
    assert.equal(result.content.filter(v => v.type === 'image').length, 3)
    assert.equal(result.content.filter(v => v.type === 'resource_link').length, 3)
    assert.deepEqual(assets, [0, 1, 2].map(i => `https://images.meigen.ai/hit-${i}.png`))
    assert.doesNotMatch(JSON.stringify(result), /first-|hit-3/)
    const fewer = await run({ query: 'poster', limit: 1 })
    assert.equal(fewer.content.filter(v => v.type === 'image').length, 1)
  } finally { globalThis.fetch = previous }
})

test('same-direction follow-up uses the returned snapshot and offset rather than repeating page one', async () => {
  const snapshotId = '11111111-2222-4333-8444-555555555555'
  const previous = globalThis.fetch
  const seen = []
  globalThis.fetch = async input => {
    const url = new URL(input)
    seen.push(url)
    const offset = Number(url.searchParams.get('offset'))
    return Response.json({ success: true, data: Array.from({ length: 3 }, (_, i) => ({ id: `hit-${offset + i}`, text: 'poster', likes: 0, views: 0, media_urls: [] })), snapshot_id: snapshotId, snapshot_expires_at: 1234567890, next_offset: offset < 3 ? 3 : null })
  }
  try {
    const { run } = searchTool({ meigenBaseUrl: 'https://test.invalid' })
    const first = await run({ query: 'poster' })
    assert.equal(first.structuredContent.paginationMode, 'snapshot')
    assert.equal(first.structuredContent.snapshotExpiresAt, 1234567890)
    const next = await run({ query: first.structuredContent.query, snapshotId: first.structuredContent.snapshotId, offset: first.structuredContent.nextOffset })
    assert.equal(seen[0].searchParams.get('pagination'), 'snapshot')
    assert.equal(seen[1].searchParams.get('snapshot'), snapshotId)
    assert.equal(seen[1].searchParams.get('offset'), '3')
    assert.equal(next.structuredContent.hasMore, false)
    assert.deepEqual([...first.structuredContent.results, ...next.structuredContent.results].map(v => v.id), ['hit-0', 'hit-1', 'hit-2', 'hit-3', 'hit-4', 'hit-5'])
  } finally { globalThis.fetch = previous }
})

test('snapshot errors and missing or changed snapshot identities never fall back to page one', async () => {
  const snapshotId = '11111111-2222-4333-8444-555555555555'
  const previous = globalThis.fetch
  try {
    for (const response of [new Response('{}', { status: 410 }), new Response('{}', { status: 503 }), Response.json({ success: true, data: [] }), Response.json({ success: true, data: [], snapshot_id: '22222222-2222-4333-8444-555555555555', next_offset: null })]) {
      let calls = 0
      globalThis.fetch = async () => { calls++; return response }
      const result = await searchTool({ meigenBaseUrl: 'https://test.invalid' }).run({ query: 'poster', snapshotId, offset: 3 })
      assert.equal(result.isError, true)
      assert.equal(result.structuredContent.success, false)
      assert.equal(calls, 1)
      assert.doesNotMatch(result.content[0].text, /Found \d+ results/)
    }
  } finally { globalThis.fetch = previous }
})

test('snapshot pages with hidden entries retain a continuation and live-offset fallback discloses its limits', async () => {
  const snapshotId = '11111111-2222-4333-8444-555555555555'
  const previous = globalThis.fetch
  try {
    globalThis.fetch = async () => Response.json({ success: true, data: [], snapshot_id: snapshotId, next_offset: 6 })
    const { run } = searchTool({ meigenBaseUrl: 'https://test.invalid' })
    const empty = await run({ query: 'poster', snapshotId, offset: 3 })
    assert.equal(empty.structuredContent.hasMore, true)
    assert.match(empty.content[0].text, /More results/)
    globalThis.fetch = async () => Response.json({ success: true, data: Array.from({ length: 3 }, (_, i) => ({ id: String(i), text: 'poster', likes: 0, views: 0, media_urls: [] })) })
    const legacy = await run({ query: 'poster' })
    assert.equal(legacy.structuredContent.paginationMode, 'offset')
    assert.equal(legacy.structuredContent.nextOffset, 3)
    assert.match(legacy.content[0].text, /may shift between calls/)
  } finally { globalThis.fetch = previous }
})

test('legacy offset follow-up omits snapshot negotiation and category continuation is idempotent', async () => {
  const snapshotId = '11111111-2222-4333-8444-555555555555'
  const previous = globalThis.fetch
  try {
    const seen = []
    globalThis.fetch = async input => {
      const url = new URL(input)
      seen.push(url)
      if (Number(url.searchParams.get('offset')) > 0 && !url.searchParams.get('snapshot')) {
        assert.equal(url.searchParams.has('pagination'), false, 'the real backend rejects snapshot mode without a snapshot at offset > 0')
      }
      return Response.json({ success: true, data: [], ...(url.searchParams.get('snapshot') ? { snapshot_id: snapshotId, next_offset: null } : {}) })
    }
    const { run } = searchTool({ meigenBaseUrl: 'https://test.invalid' })
    await run({ query: 'poster', offset: 3 })
    await run({ query: 'portrait Photography', category: 'Photography', snapshotId, offset: 3 })
    assert.equal(seen[1].searchParams.get('q'), 'portrait Photography')
  } finally { globalThis.fetch = previous }
})

test('pagination stops at the backend offset ceiling instead of suggesting an invalid next call', async () => {
  const previous = globalThis.fetch
  try {
    globalThis.fetch = async () => Response.json({ success: true, data: Array.from({ length: 3 }, (_, i) => ({ id: String(i), text: 'poster', likes: 0, views: 0, media_urls: [] })) })
    const { run } = searchTool({ meigenBaseUrl: 'https://test.invalid' })
    const result = await run({ query: 'poster', offset: 100000 })
    assert.equal(result.structuredContent.nextOffset, null)
    assert.equal(result.structuredContent.hasMore, false)
    assert.throws(() => run({ query: 'poster', offset: 100001 }))
  } finally { globalThis.fetch = previous }
})

for (const phase of ['before dispatch', 'during search', 'during preview']) {
  test(`search cancellation ${phase} returns neutral text without retry advice or stale results`, async t => {
    const controller = new AbortController()
    const snapshotId = '11111111-2222-4333-8444-555555555555'
    let calls = 0
    t.mock.method(globalThis, 'fetch', async (input, { signal }) => {
      calls++
      if (phase === 'during preview' && new URL(input).pathname === '/api/search') {
        return Response.json({ success: true, data: [{ id: 'hit', text: 'poster', likes: 0, views: 0, media_urls: ['https://images.meigen.ai/preview.png'] }], snapshot_id: snapshotId, next_offset: null })
      }
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        controller.abort()
      })
    })
    if (phase === 'before dispatch') controller.abort()
    const { handler } = searchTool({ meigenBaseUrl: 'https://test.invalid' })
    const result = await handler({ query: 'poster', limit: 3, snapshotId, offset: 3 }, { signal: controller.signal })
    assert.equal(calls, phase === 'before dispatch' ? 0 : phase === 'during search' ? 1 : 2)
    assert.deepEqual(result.content, [{ type: 'text', text: 'Search cancelled.' }])
    assert.equal(result.structuredContent.error.code, 'cancelled')
    assert.equal(result.structuredContent.error.retryable, false)
    assert.equal(result.structuredContent.snapshotId, snapshotId)
    assert.equal(result.structuredContent.offset, 3)
    assert.equal(result.structuredContent.results, undefined)
    assert.doesNotMatch(result.content[0].text, /unavailable|retry|expired/i)
  })
}
