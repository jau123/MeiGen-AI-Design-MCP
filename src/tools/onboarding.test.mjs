import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import serverModule from '../server.js'
import guidanceModule from '../lib/skill-guidance.js'

const { createServer } = serverModule
const packageVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version
const requestId = '11111111-2222-4333-8444-555555555555'
const config = { meigenBaseUrl:'https://www.meigen.ai', uploadGatewayUrl:'https://gen.meigen.ai', openaiBaseUrl:'https://api.openai.com', openaiModel:'gpt-image-2' }

async function session(token, fetchResponse, run) {
  const previous = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url, init) => {
    requests.push({url:String(url),body:init?.body ? JSON.parse(init.body) : undefined})
    if (!fetchResponse) throw new Error('Unexpected network request from an anonymous user')
    return fetchResponse(String(url),init)
  }
  const server = createServer({...config,meigenApiToken:token})
  const client = new Client({name:'first-time-user',version:'1.0.0'})
  const [clientTransport,serverTransport] = InMemoryTransport.createLinkedPair()
  try {
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    await run(client,requests)
  } finally {
    await client.close()
    await server.close()
    globalThis.fetch = previous
  }
}
const call = (client,name,args) => client.callTool({name,arguments:args})

test('legacy account API-key URL remains compatible while primary setup uses OAuth', () => {
  const account = guidanceModule.SKILL_ACCOUNT_GUIDE
  assert.equal(account.apiKeysUrl, 'https://www.meigen.ai/profile/api-keys')
  assert.equal(account.apiKeysUrlDeprecated, true)
  assert.equal(account.connection.setupUrl, 'https://www.meigen.ai/mcp')
  assert.equal(account.connection.authentication, 'OAuth account sign-in')
  assert.equal(account.legacyCompatibility.existingIntegrationsOnly, true)
})

test('fresh anonymous MCP client sees scenarios, source materials, version and host setup', async () => {
  await session(undefined,undefined,async client => {
    assert.equal(client.getServerVersion().version,packageVersion)
    const {tools}=await client.listTools()
    assert.equal(tools.length,17)
    const videoFields = tools.find(t => t.name === 'generate_video').inputSchema.properties
    for (const key of ['contentReferenceImages', 'referenceVideos', 'referenceAudios']) assert.match(videoFields[key].description, /referenceMentionSyntax/)
    assert.match(client.getInstructions(), /referenceMentionSyntax/)
    assert.match(client.getInstructions(), /upload_reference_media.*kind, modelId/)
    assert.match(client.getInstructions(), /contentReferenceImages: \[\]/)
    assert.match(client.getInstructions(), /Do not mix endpoint frames with content images, saved characters, referenceVideos or referenceAudios/)
    assert.match(client.getInstructions(), /meigen:characters:read consent/)
    assert.match(client.getInstructions(), /API key cannot read or use private characters/)
    assert.match(client.getInstructions(), /not creation, editing or deletion/)
    assert.match(client.getInstructions(), /output_only bills output seconds alone/)
    assert.match(client.getInstructions(), /audio may select the reference rate/)
    assert.equal(tools.some(t => t.name === 'list_characters'), false)
    assert.equal(tools.some(tool => tool.name === 'comfyui_workflow'), false)
    assert.deepEqual(tools.find(tool => tool.name === 'generate_image').inputSchema.properties.provider.enum, ['openai', 'meigen'])
    const description=name=>tools.find(t=>t.name===name).description
    assert.match(description('remove_background'),/Required: one actual source photo/)
    assert.match(description('generate_product_detail_images'),/one actual product photo.*resolved image count/)
    assert(tools.find(t=>t.name==='generate_product_detail_images').inputSchema.required.includes('modules'))
    assert.match(description('generate_marketing_poster'),/An image is not required/)
    assert.match(description('generate_ai_background'),/custom needs a background description/)
    assert.match(client.getInstructions(),/Authorization: Bearer/)
    assert.match(client.getInstructions(),/https:\/\/www.meigen.ai\/api\/mcp/)
    assert.match(client.getInstructions(),/https:\/\/www.meigen.ai\/profile/)
    assert.doesNotMatch(client.getInstructions(),/eligible for daily free credits/)
  })
})

test('media preparation exposes a validated structured result through a real MCP client', async () => {
  const prepared = { success:true,kind:'video',mediaUrl:'https://images.meigen.ai/reference-pack-sources/mcp/a.mp4',mimeType:'video/mp4',durationSeconds:4,bytes:1024,retentionDays:7,publiclyAccessible:true }
  await session('meigen_sk_test', () => Response.json(prepared), async client => {
    const tool = (await client.listTools()).tools.find(t => t.name === 'upload_reference_media')
    assert.ok(tool.outputSchema.properties.mediaUrl)
    const result = await call(client, 'upload_reference_media', {kind:'video',modelId:'video-fixture',sourceUrl:'https://public.example/clip.mp4'})
    assert.deepEqual(result.structuredContent, prepared)
    assert.deepEqual(JSON.parse(result.content[0].text), prepared)
  })
})

test('media preparation returns structured errors for missing credentials and invalid responses', async () => {
  const input = {kind:'video',modelId:'video-fixture',sourceUrl:'https://public.example/clip.mp4'}
  await session(undefined, undefined, async (client, requests) => {
    const result = await call(client, 'upload_reference_media', input)
    assert.equal(result.structuredContent.code, 'authentication_required')
    assert.equal(requests.length, 0)
  })
  for (const body of [{success:true}, {success:true,kind:'audio',mediaUrl:'https://evil.example/clip.mp4'}]) {
    await session('meigen_sk_test', () => Response.json(body), async client => {
      const result = await call(client, 'upload_reference_media', input)
      assert.equal(result.isError, true)
      assert.equal(result.structuredContent.code, 'upload_failed')
      assert.equal(result.structuredContent.mediaUrl, undefined)
    })
  }
})

test('media rate limits preserve delta-seconds and HTTP-date Retry-After in structured output', async () => {
  const input = {kind:'video',modelId:'video-fixture',sourceUrl:'https://public.example/clip.mp4'}
  const date = new Date(Date.now() + 60_000).toUTCString()
  for (const [header, html] of [['45', false], [date, false], [date, true], ['invalid', false], ['-1', false], ['99999999999999999999999', false], ['Mon, 01 Jan 2001 00:00:00 GMT', false]]) {
    await session('meigen_sk_test', () => html
      ? new Response('<html>Busy</html>', {status:429,headers:{'Retry-After':header}})
      : Response.json({success:false,code:'upload_busy',error:'Wait before retrying.'},{status:429,headers:{'Retry-After':header}}), async client => {
      const result = await call(client, 'upload_reference_media', input)
      assert.equal(result.isError, true)
      const delay = result.structuredContent.retryAfterSeconds
      if (header === date) assert.ok(delay > 0 && delay <= 60)
      else if (header === '45') assert.equal(delay, 45)
      else if (header.startsWith('Mon,')) assert.equal(delay, 0)
      else assert.equal(delay, undefined)
      assert.notEqual(delay, null)
      assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent)
    })
  }
})

test('missing legacy key guides OAuth sign-in without a network call or new-key creation', async () => {
  await session(undefined,undefined,async (client,requests) => {
    const r=await call(client,'generate_marketing_poster',{requestId,brand:'Coffee weekend'})
    assert.equal(r.isError,true)
    assert.equal(r.structuredContent.nextAction.url,'https://www.meigen.ai/mcp')
    assert.match(r.structuredContent.nextAction.message,/OAuth sign-in/)
    assert.match(r.structuredContent.nextAction.message,/MEIGEN_API_TOKEN.*Authorization: Bearer/)
    assert.match(r.structuredContent.nextAction.message,/Never request the secret in chat/)
    assert.equal(requests.length,0)
  })
})

test('invalid legacy key guides connection recovery and stops polling', async () => {
  await session('meigen_sk_test',()=>Response.json({success:false,error:'Invalid API token'},{status:401}),async client=>{
    const r=await call(client,'generate_marketing_poster',{requestId,brand:'Coffee weekend'})
    assert.equal(r.structuredContent.nextAction.type,'configure_auth')
    assert.match(r.structuredContent.nextAction.message,/invalid\/expired\/revoked/)
    assert.equal(r.structuredContent.nextAction.tool,undefined)
  })
})

test('insufficient balance retains exact required/available and points to purchasing in the same account', async () => {
  await session('meigen_sk_test',()=>Response.json({success:false,error:'Insufficient credits',required:5,available:2},{status:402}),async client=>{
    const r=await call(client,'generate_marketing_poster',{requestId,brand:'Coffee weekend'})
    const body=r.structuredContent
    assert.equal(body.required-body.available,3)
    assert.equal(body.nextAction.url,'https://www.meigen.ai/profile')
    assert.match(body.nextAction.message,/connected MeiGen account.*Top Up/)
    assert.match(body.nextAction.message,/purchased credits only/)
    assert.match(body.nextAction.message,/new requestId/)
    assert.equal(body.nextAction.tool,undefined)
  })
})

test('upload failures distinguish correcting a large source from one bounded retry, and never submit generation', async () => {
  for (const [status,action,pattern] of [[413,'prepare_image',/8 MiB.*3 MiB/],[503,'retry_upload',/once.*No generation was submitted or charged/]]) {
    await session('meigen_sk_test',()=>Response.json({success:false,error:'Image preparation failed'},{status}),async (client,requests)=>{
      const r=await call(client,'upload_skill_image',{imageBase64:'AAAA'})
      assert.equal(r.structuredContent.nextAction.type,action)
      assert.match(r.structuredContent.nextAction.message,pattern)
      assert.equal(requests.length,1)
      assert.match(requests[0].url,/\/skills\/upload$/)
      assert.equal(r.structuredContent.nextAction.tool,undefined)
    })
  }
})

test('subject-only poster and explicit two-image product detail are forwarded without invented requirements', async () => {
  await session('meigen_sk_test',()=>Response.json({success:true,generationId:'accepted-job'}),async(client,requests)=>{
    await call(client,'generate_marketing_poster',{requestId,brand:'Coffee weekend'})
    assert.equal(requests[0].body.productImages,undefined)
    await call(client,'generate_product_detail_images',{requestId,productImage:'https://images.meigen.ai/product.png',modules:['hero','detail']})
    assert.deepEqual(requests[1].body.modules,['hero','detail'])
    assert.equal(requests[1].body.productName,undefined)
  })
})

test('omitting product detail modules cannot accidentally start the HTTP API default three-image batch', async () => {
  await session('meigen_sk_test',undefined,async(client,requests)=>{
    const result=await call(client,'generate_product_detail_images',{requestId,productImage:'https://images.meigen.ai/product.png'})
    assert.equal(result.isError,true)
    assert.equal(requests.length,0)
  })
})


test('initial Upscale requires a confirmed quote before any file access or HTTP dispatch', async () => {
  await session('meigen_sk_test',undefined,async(client,requests)=>{
    const {tools}=await client.listTools()
    assert(tools.find(t=>t.name==='upscale_image').inputSchema.required.includes('confirmedCredits'))
    const result=await call(client,'upscale_image',{requestId,imageUrl:'/nonexistent/original.png'})
    assert.equal(result.isError,true)
    assert.match(JSON.stringify(result),/confirmedCredits/)
    assert.equal(requests.length,0)
  })
})
test('Upscale attachments preserve purpose and send an accepted first-call quote', async () => {
  await session('meigen_sk_test',(url)=>Response.json(url.endsWith('/upload')
    ? {success:true,imageUrl:'https://images.meigen.ai/original.png'}
    : {success:true,generationId:'enhanced-job'}),async(client,requests)=>{
    const upload=await call(client,'upload_skill_image',{purpose:'upscale',imageBase64:'AAAA'})
    await call(client,'upscale_image',{requestId,imageUrl:upload.structuredContent.imageUrl,confirmedCredits:2})
    assert.equal(requests[0].body.purpose,'upscale')
    assert.equal(requests[1].body.confirmedCredits,2)
    assert.equal(requests[1].body.allowDownscale,false)
  })
})
test('zero-balance upload directs top-up and same-upload retry without creating a Skill receipt', async () => {
  await session('meigen_sk_test',()=>Response.json({success:false,code:'insufficient_credits',available:0},{status:402}),async(client,requests)=>{
    const result=await call(client,'upload_skill_image',{purpose:'upscale',imageBase64:'AAAA'})
    assert.equal(result.structuredContent.nextAction.type,'top_up')
    assert.match(result.structuredContent.nextAction.message,/retry the same upload/)
    assert.equal(requests.length,1)
  })
})

test('an accepted Skill with unavailable records stops polling without replacing the job', async () => {
  await session('meigen_sk_test',()=>Response.json({success:false,code:'generation_unavailable',status:'failed',retryable:false},{status:410}),async(client,requests)=>{
    const result=await call(client,'check_skill',{skill:'upscale',requestId})
    assert.equal(result.structuredContent.nextAction.type,'review_missing')
    assert.equal(result.structuredContent.nextAction.tool,undefined)
    assert.match(result.structuredContent.nextAction.message,/do not resubmit/)
    assert.equal(requests.length,1)
  })
})

test('published Skill schemas distinguish poster constraints, style precedence and reference-image roles', async () => {
  await session(undefined, undefined, async client => {
    const { tools } = await client.listTools()
    const poster = tools.find(tool => tool.name === 'generate_marketing_poster').inputSchema
    const detail = tools.find(tool => tool.name === 'generate_product_detail_images').inputSchema
    assert.match(poster.properties.content.description, /exact visible wording.*style, layout and design directions in extraNotes or customStyle/)
    assert.match(poster.properties.extraNotes.description, /verified facts.*requested display copy.*layout.*not text to print verbatim/)
    assert.match(poster.properties.styleId.description, /ID, not.*display label.*Auto/)
    assert.match(poster.properties.customStyle.description, /overrides styleId.*styleImage/)
    assert.match(poster.properties.styleImage.description, /PRIMARY.*Do not copy.*products, text or layout/)
    assert.match(poster.properties.logo.description, /exact brand logo/)
    assert.match(poster.properties.productImages.description, /up to three.*not its visual style/)
    assert.match(detail.properties.productImage.description, /main product photo/)
    assert.match(detail.properties.modelImage.description, /person.*hero and scene.*Not an image-generation model/)
    assert.match(detail.properties.extraProductImages.description, /up to two/)
    assert.match(poster.properties.quality.description, /not output resolution.*list_skills.*no fixed completion time/)
    assert.equal(poster.properties.extraNotes.maxLength, 500)
    assert.equal(poster.properties.resolution, undefined)
    assert(!poster.required.includes('logo') && !poster.required.includes('productImages') && !poster.required.includes('styleId'))
  })
})

test('published API-guide MCP example validates and calls the dedicated endpoint unchanged', async () => {
  const { readFile } = await import('node:fs/promises')
  for (const file of ['SKILLS_API.md']) {
    const source = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8')
    const examples = [...source.matchAll(/```json\s*\n([\s\S]*?)```/g)]
      .map(([, json]) => { try { return JSON.parse(json) } catch { return null } })
      .filter(value => value?.name === 'generate_marketing_poster')
    assert.equal(examples.length, 1, file)
    await session('meigen_sk_test', () => Response.json({ success: true, generationId: 'documented-poster-job' }), async (client, requests) => {
      const example = examples[0]
      const result = await client.callTool(example)
      assert.equal(result.isError, undefined, JSON.stringify(result))
      assert.equal(requests.length, 1)
      assert.match(requests[0].url, /\/api\/skills\/brand-poster\/run$/)
      assert.deepEqual(requests[0].body, example.arguments)
      assert.equal(example.arguments.autoCopy, false)
      assert.equal(example.arguments.styleId, 'minimalist')
      assert.ok(example.arguments.extraNotes)
      assert.equal(result.structuredContent.generationId, 'documented-poster-job')
    })
  }
})


test('a removed provider is rejected rather than silently redirected to a paid cloud provider', async () => {
  await session('meigen_sk_fixture', undefined, async (client, requests) => {
    const result = await call(client, 'generate_image', { prompt: 'test image', provider: 'comfyui' })
    assert.equal(result.isError, true)
    assert.equal(requests.length, 0)
  })
})


test('stdio never exposes private library tools, even with an existing API key', async () => {
  for (const token of [undefined, 'meigen_sk_existing_fixture']) {
    await session(token, undefined, async (client, requests) => {
      const { tools } = await client.listTools()
      for (const name of ['search_favorites', 'list_boards', 'search_history', 'get_library_item', 'save_favorite']) {
        assert.equal(tools.some(tool => tool.name === name), false)
        const result = await call(client, name, {})
        assert.equal(result.isError, true)
      }
      assert.equal(requests.length, 0)
      assert.match(client.getInstructions(), /remote OAuth|OAuth sign-in/)
      assert.match(client.getInstructions(), /legacy API key cannot access private library data/)
    })
  }
})
