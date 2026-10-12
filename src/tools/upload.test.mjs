import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import skillsModule from './skills.js'
import uploadModule from '../lib/upload.js'

const { classifySkillImageSource, registerSkillTools, resolveSkillImages } = skillsModule
const { prepareSkillImage, prepareUpscaleSourceImage, processAndUploadSkillImage } = uploadModule
const config = { meigenBaseUrl: 'https://www.meigen.ai', uploadGatewayUrl: 'https://gen.meigen.ai', meigenApiToken: 'meigen_sk_fixture' }
const requestId = '11111111-2222-4333-8444-555555555555'
const metadataXml = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><synthetic>fixture location</synthetic></x:xmpmeta>'

function registry() {
  const tools = new Map()
  registerSkillTools({ tool: (name, ...args) => tools.set(name, { schema: args[1], run: args.at(-1) }), registerTool: (name, definition, run) => tools.set(name, { schema: definition.inputSchema, run }) }, config)
  return tools
}

async function sourceImage(options = {}) {
  return sharp({ create: { width: 24, height: 12, channels: 4, background: { r: 12, g: 56, b: 90, alpha: 0.3 }, ...options } }).png().toBuffer()
}

async function withFile(bytes, name, action) {
  const dir = await mkdtemp(join(tmpdir(), 'meigen-local-upload-'))
  const path = join(dir, name)
  await writeFile(path, bytes)
  try { return await action(path) }
  finally { await rm(dir, { recursive: true, force: true }) }
}

test('image path classification supports Windows drives, UNC, POSIX, home and decoded file URLs', () => {
  for (const path of ['C:\\Users\\me\\product.png', 'c:/Users/me/product.png', '\\\\server\\share\\product.png', '/tmp/product.png']) {
    assert.deepEqual(classifySkillImageSource(path), { kind: 'local', path })
  }
  assert.deepEqual(classifySkillImageSource('~/product.png'), { kind: 'local', path: `${homedir()}/product.png` })
  const path = join(tmpdir(), 'product photo.png')
  assert.deepEqual(classifySkillImageSource(pathToFileURL(path).href), { kind: 'local', path })
  assert.deepEqual(classifySkillImageSource('HTTPS://public.example/photo.png'), { kind: 'remote', url: 'https://public.example/photo.png' })
})

test('image path classification rejects ambiguous paths, device paths and unsafe URL forms', () => {
  for (const value of ['photo.png', './photo.png', '../photo.png', 'C:photo.png', '\\photo.png', '~someone/photo.png', '\\\\.\\NUL', '\\\\?\\C:\\photo.png',
    'data:image/png;base64,AAAA', 'http://public.example/a.png', 'ftp://public.example/a.png', 'https://user:secret@public.example/a.png',
    'https://public.example:8443/a.png', 'https://public.example/a.png#fragment', 'file:///tmp/a.png?query', 'file:///tmp/a.png#fragment']) {
    assert.throws(() => classifySkillImageSource(value), undefined, value)
  }
})

test('small JPEG and upscale sources are fully decoded, oriented and stripped of EXIF, XMP and ICC', async () => {
  const bytes = await sharp({ create: { width: 24, height: 12, channels: 3, background: '#cc5522' } })
    .withMetadata({ orientation: 6 }).withXmp(metadataXml).jpeg().toBuffer()
  const before = await sharp(bytes).metadata()
  assert.ok(before.exif && before.xmp && before.icc)
  for (const prepare of [prepareSkillImage, prepareUpscaleSourceImage]) {
    const image = await prepare(bytes, 'image/jpeg')
    const after = await sharp(image.buffer).metadata()
    assert.notDeepEqual(image.buffer, bytes)
    assert.equal(image.mimeType, 'image/jpeg')
    assert.equal(after.width, 12)
    assert.equal(after.height, 24)
    for (const key of ['exif', 'xmp', 'icc', 'orientation']) assert.equal(after[key], undefined, key)
  }
})

test('reference and upscale preserve transparency while removing metadata', async () => {
  const bytes = await sharp(await sourceImage()).withMetadata().withXmp(metadataXml).png().toBuffer()
  for (const prepare of [prepareSkillImage, prepareUpscaleSourceImage]) {
    const image = await prepare(bytes, 'image/png')
    const after = await sharp(image.buffer).metadata()
    assert.equal(after.hasAlpha, true)
    assert.equal(after.width, 24)
    assert.equal(after.height, 12)
    for (const key of ['exif', 'xmp', 'icc']) assert.equal(after[key], undefined, key)
    const { data } = await sharp(image.buffer).raw().toBuffer({ resolveWithObject: true })
    assert.ok(data[3] > 0 && data[3] < 255)
  }
})

test('animated GIF always becomes the first frame; upscale rejects animation', async () => {
  const bytes = await sharp(Buffer.from([255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255]), { raw: { width: 2, height: 2, channels: 3, pageHeight: 1 } })
    .gif({ loop: 0, delay: [10, 10] }).toBuffer()
  assert.equal((await sharp(bytes).metadata()).pages, 2)
  const result = await prepareSkillImage(bytes, 'image/gif')
  assert.equal(result.mimeType, 'image/png')
  const meta = await sharp(result.buffer).metadata()
  assert.equal(meta.height, 1)
  assert.equal(meta.pages, undefined)
  const pixel = await sharp(result.buffer).removeAlpha().raw().toBuffer()
  assert.deepEqual([...pixel.subarray(0, 3)], [255, 0, 0])
  await assert.rejects(() => prepareUpscaleSourceImage(bytes, 'image/gif'), /still JPEG, PNG or WebP/)
})

test('truncated images that pass metadata are rejected before upload or paid submission', async () => {
  const complete = await sourceImage({ width: 32, height: 32 })
  const corrupt = complete.subarray(0, complete.length - 20)
  assert.equal((await sharp(corrupt).metadata()).width, 32)
  await assert.rejects(() => prepareSkillImage(corrupt, 'image/png'), /Unable to decode/)
  await assert.rejects(() => prepareUpscaleSourceImage(corrupt, 'image/png'), /Unable to decode/)
  const previous = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('must not fetch') }
  try {
    await withFile(corrupt, 'bad.png', async path => {
      for (const tool of ['remove_background', 'upscale_image']) {
        const result = await registry().get(tool).run({ requestId, ...(tool === 'upscale_image' ? { imageUrl: path } : { productImage: path }) })
        assert.equal(result.isError, true)
        assert.equal(result.structuredContent.nextAction.type, 'prepare_image')
      }
    })
    assert.equal(calls, 0)
  } finally { globalThis.fetch = previous }
})

test('upscale retains 5000px source dimensions while reference images resize to 4096px', async () => {
  const bytes = await sourceImage({ width: 5000, height: 100 })
  const upscale = await prepareUpscaleSourceImage(bytes, 'image/png')
  const reference = await prepareSkillImage(bytes, 'image/png')
  assert.equal((await sharp(upscale.buffer).metadata()).width, 5000)
  assert.equal((await sharp(upscale.buffer).metadata()).hasAlpha, true)
  assert.equal((await sharp(reference.buffer).metadata()).width, 4096)
})

test('source byte and pixel limits fail without network requests', async () => {
  await assert.rejects(() => prepareUpscaleSourceImage(Buffer.alloc(64 * 1024 * 1024 + 1), 'image/png'), /64 MiB/)
  await assert.rejects(() => prepareSkillImage(Buffer.alloc(32 * 1024 * 1024 + 1), 'image/png'), /32 MiB/)
  const png = await sourceImage({ width: 1, height: 1 })
  // PNG dimensions are in the IHDR header. Invalid CRC is also rejected by full decoding.
  const large = Buffer.from(png)
  large.writeUInt32BE(8001, 16)
  large.writeUInt32BE(8001, 20)
  await assert.rejects(() => prepareUpscaleSourceImage(large, 'image/png'), /Unable to decode/)
})

test('presign and PUT have bounded abort signals and unchanged images upload only once', async () => {
  const previousFetch = globalThis.fetch
  const previousTimeout = globalThis.setTimeout
  const timeouts = []
  let uploads = 0
  globalThis.setTimeout = (callback, ms, ...args) => { timeouts.push(ms); return previousTimeout(callback, ms, ...args) }
  globalThis.fetch = async (url, init) => {
    assert.ok(init.signal instanceof AbortSignal)
    if (String(url).endsWith('/presign')) return Response.json({ success: true, presignedUrl: 'https://storage.example/signed', publicUrl: 'https://images.meigen.ai/uploads/timeouts.png' })
    uploads++
    return new Response(null, { status: 200 })
  }
  try {
    await withFile(await sourceImage({ width: 37 }), 'photo.png', async path => {
      const first = await processAndUploadSkillImage(path, config)
      assert.equal(await processAndUploadSkillImage(path, config), first)
    })
    assert.deepEqual(timeouts, [15_000, 30_000])
    assert.equal(uploads, 1)
  } finally { globalThis.fetch = previousFetch; globalThis.setTimeout = previousTimeout }
})

test('custom upload CDN references are transferred through MeiGen API; upscale skips generic upload', async () => {
  const previous = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined })
    if (String(url).endsWith('/presign')) return Response.json({ success: true, presignedUrl: 'https://storage.example/object', publicUrl: 'https://cdn.example/original.png' })
    if (String(url).endsWith('/api/skills/upload')) {
      assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer meigen_sk_fixture')
      return Response.json({ success: true, imageUrl: 'https://images.meigen.ai/uploads/transferred.png' })
    }
    return new Response(null, { status: 200 })
  }
  try {
    await withFile(await sourceImage({ width: 43 }), 'source.png', async path => {
      const reference = await resolveSkillImages({ productImage: path }, { ...config, uploadGatewayUrl: 'https://custom.example' })
      assert.equal(reference.productImage, 'https://images.meigen.ai/uploads/transferred.png')
      assert.deepEqual(calls.at(-1).body, { sourceUrl: 'https://cdn.example/original.png', purpose: 'reference' })
      calls.length = 0
      const upscale = await resolveSkillImages({ imageUrl: path }, { ...config, uploadGatewayUrl: 'https://custom.example' }, 'upscale')
      assert.equal(upscale.imageUrl, 'https://cdn.example/original.png')
      assert.equal(calls.some(call => call.url.endsWith('/api/skills/upload')), false)
    })
  } finally { globalThis.fetch = previous }
})

test('upload tool enforces exactly one valid source at runtime without I/O', async () => {
  const previous = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('must not fetch') }
  try {
    for (const input of [{}, { sourceUrl: 'https://public.example/a.png', imageBase64: 'AAAA' }, { sourceUrl: 'https://user:secret@public.example/a.png' }, { sourceUrl: 'file:///tmp/a.png' }]) {
      const result = await registry().get('upload_skill_image').run(input)
      assert.equal(result.structuredContent.nextAction.type, 'prepare_image')
      assert.equal(result.isError, true)
    }
    assert.equal(calls, 0)
  } finally { globalThis.fetch = previous }
})

test('custom modules reject blank names and descriptions', () => {
  const schema = registry().get('generate_product_detail_images').schema.customModules
  for (const module of [{ name: ' ', description: 'Detail' }, { name: 'Hero', description: '\n' }]) assert.equal(schema.safeParse([module]).success, false)
  assert.deepEqual(schema.parse([{ name: ' Hero ', description: ' Front ' }]), [{ name: 'Hero', description: 'Front' }])
})

test('upscale local upload fully decodes before storage and preserves dimensions for confirmation', async () => {
  const previous = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push(String(url))
    if (String(url).endsWith('/presign')) return Response.json({ success: true, presignedUrl: 'https://storage.example/upscale', publicUrl: 'https://images.meigen.ai/uploads/large.png' })
    if (String(url).endsWith('/run')) {
      assert.equal(JSON.parse(init.body).imageUrl, 'https://images.meigen.ai/uploads/large.png')
      return Response.json({ success: false, code: 'upscale_resize_required' }, { status: 409 })
    }
    const metadata = await sharp(init.body).metadata()
    assert.equal(metadata.width, 5000)
    assert.equal(metadata.exif, undefined)
    assert.equal(metadata.hasAlpha, true)
    return new Response(null, { status: 200 })
  }
  try {
    await withFile(await sourceImage({ width: 5000, height: 103 }), 'upscale.png', async path => {
      const result = await registry().get('upscale_image').run({ requestId, imageUrl: path, mode: 'crisp', allowDownscale: false })
      assert.equal(result.structuredContent.nextAction.type, 'confirm_resize')
    })
    assert.equal(calls.length, 3)
    assert.equal(calls.some(url => url.endsWith('/api/skills/upload')), false)
  } finally { globalThis.fetch = previous }
})
