import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import skillsModule from './skills.js'
const { registerSkillTools, allowedSkillImageUrl, resolveSkillImages } = skillsModule
import uploadModule from '../lib/upload.js'
const { prepareSkillImage } = uploadModule

const config = { meigenBaseUrl: 'https://www.meigen.ai', uploadGatewayUrl: 'https://gen.meigen.ai', meigenApiToken: 'meigen_sk_test' }
const requestId = '11111111-2222-4333-8444-555555555555'
function registry(token = config.meigenApiToken) {
  const registered = new Map()
  registerSkillTools({ tool: (name, ...args) => registered.set(name, args.at(-1)), registerTool: (name, _definition, handler) => registered.set(name, handler) }, { ...config, meigenApiToken: token })
  return registered
}

test('registers five skill tools plus capabilities, upload and recovery', () => {
  assert.deepEqual([...registry().keys()].sort(), ['check_skill', 'generate_ai_background', 'generate_marketing_poster', 'generate_product_detail_images', 'list_skills', 'remove_background', 'upload_reference_media', 'upload_skill_image', 'upscale_image'])
})

test('external image URL uploads automatically before a paid skill submission', async () => {
  const previous = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push(String(url))
    if (String(url).endsWith('/upload')) return Response.json({ success: true, imageUrl: 'https://images.meigen.ai/uploads/remote.png' })
    assert.equal(JSON.parse(init.body).productImage, 'https://images.meigen.ai/uploads/remote.png')
    return Response.json({ success: true, generationId: 'job' })
  }
  try {
    const result = await registry().get('generate_ai_background')({ requestId, productImage: 'https://public.test/photo.png' })
    assert.equal(calls.length, 2)
    assert.equal(result.structuredContent.nextAction.afterSeconds, 10)
    assert.equal(result.structuredContent.nextAction.tool, 'check_skill')
  } finally { globalThis.fetch = previous }
})

test('image preparation failure never submits generation or suggests checking a nonexistent task', async () => {
  const previous = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; return Response.json({ success: false, error: 'Invalid source' }, { status: 400 }) }
  try {
    const result = await registry().get('remove_background')({ requestId, productImage: 'https://public.test/bad.png' })
    assert.equal(calls, 1)
    assert.equal(result.structuredContent.nextAction.type, 'prepare_image')
  } finally { globalThis.fetch = previous }
})

test('invalid key and insufficient credits produce distinct non-polling advice', async () => {
  const previous = globalThis.fetch
  try {
    for (const [status, type] of [[401, 'configure_auth'], [402, 'top_up']]) {
      globalThis.fetch = async () => Response.json({ success: false, error: 'Rejected' }, { status })
      const result = await registry().get('generate_marketing_poster')({ requestId, brand: 'Studio' })
      assert.equal(result.structuredContent.nextAction.type, type)
      assert.equal(result.structuredContent.nextAction.tool, undefined)
    }
  } finally { globalThis.fetch = previous }
})

test('local file upload network failures retry upload, while storage 403 never tells users to replace their API key', async () => {
  const previous = globalThis.fetch
  const dir = await mkdtemp(join(tmpdir(), 'meigen-upload-failure-'))
  const source = join(dir, 'product.png')
  await writeFile(source, await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ffffff' } }).png().toBuffer())
  try {
    for (const mode of ['network', 'storage403', 'limited']) {
      const calls = []
      globalThis.fetch = async (url) => {
        calls.push(String(url))
        if (mode === 'network') throw new TypeError('fetch failed')
        if (mode === 'limited') return Response.json({ error: 'Rate limited' }, { status: 429 })
        if (String(url).endsWith('/upload/presign')) return Response.json({ success: true, presignedUrl: 'https://storage.test/signed', publicUrl: 'https://images.meigen.ai/product.png' })
        return new Response('', { status: 403 })
      }
      const r = await registry().get('remove_background')({ requestId, productImage: source })
      assert.equal(r.structuredContent.nextAction.type, mode === 'limited' ? 'wait_for_limit' : 'retry_upload')
      assert.equal(calls.some(url => url.endsWith('/run')), false)
    }
  } finally { globalThis.fetch = previous; await rm(dir, { recursive: true, force: true }) }
})

test('rejects non-MeiGen URLs, local network targets, credentials and nonstandard ports', () => {
  for (const url of ['http://images.meigen.ai/p.png', 'https://127.0.0.1/a', 'https://evil.test/a', 'https://user:pass@images.meigen.ai/a', 'https://images.meigen.ai:8080/a']) assert.equal(allowedSkillImageUrl(url), false)
  assert.equal(allowedSkillImageUrl('https://images.meigen.ai/p.png'), true)
})

test('transparent image preprocessing preserves alpha and allows 4096px detail', async () => {
  const source = await sharp({ create: { width: 5000, height: 100, channels: 4, background: { r: 200, g: 10, b: 20, alpha: 0.3 } } }).png().toBuffer()
  const result = await prepareSkillImage(source, 'image/png')
  const meta = await sharp(result.buffer).metadata()
  assert.equal(meta.width, 4096)
  assert.equal(meta.hasAlpha, true)
  assert.equal(result.mimeType, 'image/png')
})

test('paid submission forwards the same requestId and API token and never uses generic generation', async () => {
  const previous = globalThis.fetch
  const seen = []
  globalThis.fetch = async (url, init) => {
    seen.push({ url, token: new Headers(init.headers).get('Authorization'), body: JSON.parse(init.body) })
    return Response.json({ success: true, requestId, generationId: 'paid-job' })
  }
  try {
    const handler = registry().get('generate_marketing_poster')
    await handler({ requestId, brand: 'Studio' })
    await handler({ requestId, brand: 'Studio' })
    assert.equal(seen.length, 2)
    assert.ok(seen.every((call) => call.url.endsWith('/api/skills/brand-poster/run') && call.token === 'Bearer meigen_sk_test' && call.body.requestId === requestId))
  } finally { globalThis.fetch = previous }
})

test('anonymous calls never upload or reach a paid API', async () => {
  const previous = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('must not fetch') }
  try {
    const output = await registry(null).get('remove_background')({ requestId, productImage: '/missing.png' })
    assert.equal(output.isError, true)
    assert.match(output.content[0].text, /MEIGEN_API_TOKEN/)
  } finally { globalThis.fetch = previous }
})

test('local image uploads are stable on retry and keep PNG transparency', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'meigen-skill-test-'))
  const filename = join(directory, 'logo.png')
  const bytes = await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 25, g: 15, b: 35, alpha: 0 } } }).png().toBuffer()
  await writeFile(filename, bytes)
  const previous = globalThis.fetch
  let uploads = 0
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/upload/presign')) return Response.json({ success: true, presignedUrl: 'https://upload.example/object', publicUrl: 'https://images.meigen.ai/uploads/logo.png' })
    uploads++
    assert.equal(new Headers(init.headers).get('Content-Type'), 'image/png')
    assert.equal((await sharp(init.body).metadata()).hasAlpha, true)
    return new Response(null, { status: 200 })
  }
  try {
    const first = await resolveSkillImages({ requestId, logo: filename }, config)
    const second = await resolveSkillImages({ requestId, logo: filename }, config)
    assert.deepEqual(first, second)
    assert.equal(uploads, 1)
  } finally { globalThis.fetch = previous; await rm(directory, { recursive: true }) }
})


test('upscale submits original external URLs without generic resizing and surfaces confirmation', async () => {
  const previous = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push(String(url))
    assert.equal(JSON.parse(init.body).imageUrl, 'https://public.test/original.png')
    return Response.json({ success: false, code: 'upscale_resize_required' }, { status: 409 })
  }
  try {
    const response = await registry().get('upscale_image')({ requestId, imageUrl: 'https://public.test/original.png', mode: 'crisp', allowDownscale: false })
    assert.deepEqual(calls, ['https://www.meigen.ai/api/skills/upscale/run'])
    assert.equal(response.structuredContent.nextAction.type, 'confirm_resize')
  } finally { globalThis.fetch = previous }
})

test('upscale local transport retains dimensions and alpha for server-side confirmation', async () => {
  const source = await sharp({ create: { width: 5000, height: 100, channels: 4, background: { r: 20, g: 40, b: 80, alpha: 0.3 } } }).png().toBuffer()
  const result = await prepareSkillImage(source, 'image/png', true)
  assert.notEqual(result.buffer, source)
  const meta = await sharp(result.buffer).metadata()
  assert.equal(meta.width, 5000)
  assert.equal(meta.hasAlpha, true)
})

test('pre-cancelled Skill, upload, catalog and status calls never open a file or send HTTP', async () => {
  const previous = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('unexpected network') }
  const controller = new AbortController(); controller.abort()
  try {
    for (const [name, handler] of registry()) {
      const output = await handler({ requestId, skill: 'upscale', imageUrl: '/missing.png', productImage: '/missing.png', brand: 'Test', sourceUrl: 'https://public.test/a.png' }, { signal: controller.signal })
      assert.equal(output.structuredContent.code, 'cancelled', name)
      assert.equal(output.structuredContent.nextAction.type, 'cancelled', name)
    }
    assert.equal(calls, 0)
  } finally { globalThis.fetch = previous }
})

test('cancellation after preparation or upload stops before the paid POST', async () => {
  const previous = globalThis.fetch
  const directory = await mkdtemp(join(tmpdir(), 'meigen-skill-cancel-'))
  const filename = join(directory, 'source.png')
  await writeFile(filename, await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer())
  try {
    for (const source of ['https://public.test/source.png', filename]) {
      const controller = new AbortController(); const calls = []
      globalThis.fetch = async (url, init) => {
        calls.push(String(url)); assert.ok(init.signal)
        if (String(url).endsWith('/presign')) return Response.json({ success: true, presignedUrl: 'https://storage.test/put', publicUrl: 'https://images.meigen.ai/cancelled.png' })
        controller.abort()
        return String(url).endsWith('/upload') ? Response.json({ success: true, imageUrl: 'https://images.meigen.ai/cancelled.png' }) : new Response(null)
      }
      const output = await registry().get('remove_background')({ requestId, productImage: source }, { signal: controller.signal })
      assert.equal(output.structuredContent.code, 'cancelled')
      assert.ok(calls.every(url => !url.endsWith('/run')))
    }
  } finally { globalThis.fetch = previous; await rm(directory, { recursive: true, force: true }) }
})

test('cancellation during a paid Skill POST preserves the original recovery ID and never suggests a replacement', async () => {
  const previous = globalThis.fetch; const controller = new AbortController(); let sent = 0
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).endsWith('/brand-poster/run')); sent++
    return await new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }); controller.abort()
    })
  }
  try {
    const output = await registry().get('generate_marketing_poster')({ requestId, brand: 'Test' }, { signal: controller.signal })
    assert.equal(sent, 1); assert.equal(output.structuredContent.code, 'request_interrupted')
    assert.equal(output.structuredContent.requestId, requestId)
    assert.deepEqual(output.structuredContent.nextAction.arguments, { skill: 'brand-poster', requestId })
    assert.equal(output.structuredContent.nextAction.tool, 'check_skill')
  } finally { globalThis.fetch = previous }
})

test('cancelling Sharp preprocessing cannot progress into an upload', async () => {
  const previous = globalThis.fetch; const controller = new AbortController(); let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('unexpected upload') }
  const source = await sharp({ create: { width: 2048, height: 2048, channels: 4, background: '#8f258f80' } }).png().toBuffer()
  try {
    const pending = prepareSkillImage(source, 'image/png', false, controller.signal)
    setTimeout(() => controller.abort(), 0)
    await assert.rejects(pending, error => error.name === 'AbortError')
    assert.equal(calls, 0)
  } finally { globalThis.fetch = previous }
})

test('media preparation imports a direct URL through the bounded authenticated endpoint without generation', async () => {
 const previous=globalThis.fetch; const calls=[]
 const prepared={success:true,kind:'video',mediaUrl:'https://images.meigen.ai/reference-pack-sources/mcp/a.mp4',mimeType:'video/mp4',durationSeconds:4,bytes:1024,retentionDays:7,publiclyAccessible:true}
 globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return Response.json({...prepared,internalSecret:'NOT-PUBLIC'})}
 try {
  const input={kind:'video',modelId:'seedance-2-5',sourceUrl:'https://public.example/clip.mp4'}
  const output=await registry().get('upload_reference_media')(input,{})
  assert.equal(output.isError,undefined);assert.equal(calls.length,1)
  assert.deepEqual(output.structuredContent,prepared);assert.deepEqual(JSON.parse(output.content[0].text),prepared)
  assert.equal(calls[0].url,'https://www.meigen.ai/api/mcp/media-upload');assert.equal(calls[0].init.headers.Authorization,'Bearer meigen_sk_test');assert.deepEqual(JSON.parse(calls[0].init.body),input)
 } finally {globalThis.fetch=previous}
})

test('cancelled media preparation never dispatches an upload and returns structured cancellation', async () => {
 const previous=globalThis.fetch
 globalThis.fetch=async()=>{throw new Error('Unexpected upload')}
 try {
  const controller=new AbortController();controller.abort()
  const result=await registry().get('upload_reference_media')({kind:'video',modelId:'video',sourceUrl:'https://public.example/clip.mp4'},{signal:controller.signal})
  assert.equal(result.isError,true);assert.equal(result.structuredContent.code,'cancelled')
 } finally {globalThis.fetch=previous}
})
