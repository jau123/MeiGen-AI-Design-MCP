import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, readdir, stat, writeFile, chmod, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import sharp from 'sharp'
import { z } from 'zod'
import { createRequire } from 'node:module'
// These sources compile to CJS. Use one loader/cache on Node 20 as in the shipped runtime.
const require = createRequire(import.meta.url)
const apiModule = require('../lib/meigen-api.ts')
const operationModule = require('../lib/generation-operation.ts')
const contractModule = require('../lib/generation-contract.ts')
const httpModule = require('../lib/generation-http.ts')
const semaphoreModule = require('../lib/semaphore.ts')
const imageModule = require('./generate-image.ts')
const videoModule = require('./generate-video.ts')
const checkModule = require('./check-generation.ts')
const modelsModule = require('./list-models.ts')
const { MeiGenApiClient } = apiModule
const { runMeiGenGeneration } = operationModule
const { generationOutputSchema } = contractModule
const { withHttpResponse, boundedBytes } = httpModule
const config = { meigenBaseUrl: 'https://api.example', meigenApiToken: 'test-key-not-a-real-credential', uploadGatewayUrl: 'https://upload.example', openaiBaseUrl: 'https://byok.example', openaiModel: 'test-image' }
const complete = { status:'completed', imageUrl:'https://images.meigen.ai/test.png', imageUrls:['https://images.meigen.ai/test.png'], mediaType:'image', error:null }
const api = () => new MeiGenApiClient(config)
const valid = body => { assert.equal(z.object(generationOutputSchema).safeParse(body).success, true); return body }
async function isolated(run) {
 const directory = await mkdtemp(join(tmpdir(),'meigen-orchestration-test-'))
 const previous = { fetch: globalThis.fetch, directory:process.env.MEIGEN_REQUEST_STORE_DIR, output:process.env.MEIGEN_OUTPUT_DIR }
 process.env.MEIGEN_REQUEST_STORE_DIR = join(directory,'receipts')
 process.env.MEIGEN_OUTPUT_DIR = join(directory,'output')
 try { await run(directory) } finally { globalThis.fetch=previous.fetch; if(previous.directory===undefined)delete process.env.MEIGEN_REQUEST_STORE_DIR;else process.env.MEIGEN_REQUEST_STORE_DIR=previous.directory; if(previous.output===undefined)delete process.env.MEIGEN_OUTPUT_DIR;else process.env.MEIGEN_OUTPUT_DIR=previous.output; await rm(directory,{recursive:true,force:true}) }
}
function tool(register, client=api(), extraConfig={}) {
 let handler, schema
 register({registerTool:(_name, definition, callback)=>{handler=callback;schema=definition}},client,{...config,...extraConfig})
 return {run: (args,signal)=>handler(args,{signal,sendNotification:async()=>{}}), schema}
}

test('submit-only returns structured accepted identity without polling/download; same ID is stable after a separate process',()=>isolated(async()=>{
 const requestId=randomUUID(); let posts=0
 globalThis.fetch=async (url,init)=>{if(String(url).includes('/requests/'))return Response.json({success:false,code:'request_not_found'},{status:404});assert.equal(String(url),'https://api.example/api/generate/v2');posts++;assert.equal(JSON.parse(init.body).idempotencyKey,requestId);return Response.json({success:true,generationId:'image-job',modelId:'chosen',creditsUsed:4})}
 const input={prompt:'first frame',requestId,wait:false,download:false}
 const result=valid(await runMeiGenGeneration('image',input,api(),config));assert.equal(result.status,'processing');assert.equal(result.generationId,'image-job');assert.equal(posts,1)
 const moduleUrl=new URL('../lib/generation-operation.ts',import.meta.url).href
 const child=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',`const mod=await import(${JSON.stringify(moduleUrl)}); const {runMeiGenGeneration}=mod.default??mod; const result=await runMeiGenGeneration('image',${JSON.stringify(input)},{getGenerationByRequestId:async()=>({status:'processing',generationId:'image-job'}),generateImage:async()=>{throw Error('must not resubmit')}},${JSON.stringify(config)}); process.stdout.write(JSON.stringify(result));`],{cwd:process.cwd(),encoding:'utf8',env:process.env})
 assert.equal(child.status,0,child.stderr);assert.equal(JSON.parse(child.stdout).generationId,'image-job');assert.equal(JSON.parse(child.stdout).deduped,true)
}))

test('same requestId changed prompt or local file bytes conflicts before upload/paid call',()=>isolated(async directory=>{
 const imagePath=join(directory,'source.png');await sharp({create:{width:16,height:16,channels:4,background:'#ff000080'}}).png().toFile(imagePath)
 const requestId=randomUUID();let posts=0,uploads=0
 globalThis.fetch=async(url,init)=>{
  if(String(url).endsWith('/presign')){uploads++;return Response.json({success:true,presignedUrl:'https://storage.example/put',publicUrl:`https://images.meigen.ai/refs/${uploads}.png`})}
  if(init?.method==='PUT') return new Response(null)
  if(String(url).includes('/requests/'))return posts ? Response.json({success:true,status:'processing',generationId:'ref-job'}) : Response.json({success:false,code:'request_not_found'},{status:404})
  posts++;return Response.json({success:true,generationId:'ref-job'})
 }
 const input={prompt:'same frame',referenceImages:[imagePath],requestId,wait:false}
 assert.equal((await runMeiGenGeneration('image',input,api(),config)).success,true)
 assert.equal((await runMeiGenGeneration('image',input,api(),config)).generationId,'ref-job')
 assert.equal((await runMeiGenGeneration('image',{...input,prompt:'changed'},api(),config)).error.code,'idempotency_conflict')
 await sharp({create:{width:16,height:16,channels:4,background:'#0000ff80'}}).png().toFile(imagePath)
 assert.equal((await runMeiGenGeneration('image',input,api(),config)).error.code,'idempotency_conflict');assert.equal(posts,1);assert.equal(uploads,1)
}))

test('lost POST response reuses exact prepared URL and UUID instead of repeating local upload',()=>isolated(async directory=>{
 const path=join(directory,'ref.png');await sharp({create:{width:8,height:8,channels:3,background:'#fff'}}).png().toFile(path)
 let uploads=0;const bodies=[];const requestId=randomUUID()
 globalThis.fetch=async(url,init)=>{
  if(String(url).endsWith('/presign')){uploads++;return Response.json({success:true,presignedUrl:'https://storage.example/put',publicUrl:`https://images.meigen.ai/upload/${uploads}.png`})}
  if(init?.method==='PUT')return new Response(null)
  if(String(url).includes('/requests/'))return Response.json({success:false,error:'not found',code:'request_not_found'},{status:404})
  bodies.push(JSON.parse(init.body));if(bodies.length===1)throw new TypeError('connection lost after server accepted')
  return Response.json({success:true,generationId:'recovered-job',deduped:true})
 }
 const input={prompt:'photo',referenceImages:[path],requestId,wait:false}
 const first=await runMeiGenGeneration('image',input,api(),config);assert.equal(first.success,false);assert.equal(first.requestId,requestId)
 assert.equal((await runMeiGenGeneration('image',input,api(),config)).generationId,'recovered-job');assert.deepEqual(bodies[0],bodies[1]);assert.equal(uploads,1)
}))

test('independent same-parameter calls receive different UUIDs; no suspended prompt-only reuse',()=>isolated(async()=>{
 const ids=[];globalThis.fetch=async(_url,init)=>{ids.push(JSON.parse(init.body).idempotencyKey);return Response.json({success:true,generationId:`job-${ids.length}`})}
 await api().generateImage({prompt:'identical'});await api().generateImage({prompt:'identical'});assert.equal(new Set(ids).size,2)
}))

test('receipt permissions stay private; unsafe directories and symlinks use memory without relaxing permissions',()=>isolated(async directory=>{
 const requestId=randomUUID();globalThis.fetch=async(url)=>String(url).includes('/requests/')?Response.json({success:false,code:'request_not_found'},{status:404}):Response.json({success:true,generationId:'private-job'})
 const body=await runMeiGenGeneration('image',{prompt:'private prompt never stored',requestId,wait:false},api(),config);assert.equal(body.success,true)
 const root=process.env.MEIGEN_REQUEST_STORE_DIR;const [scope]=await readdir(root);const receipt=join(root,scope,requestId,'identity.json');const text=await readFile(receipt,'utf8')
 assert.doesNotMatch(text,/private prompt|test-key/);if(process.platform!=='win32'){assert.equal((await stat(receipt)).mode&0o777,0o600);assert.equal((await stat(root)).mode&0o777,0o700)}
 if(process.platform!=='win32'){await chmod(root,0o755);let calls=0;globalThis.fetch=async(url)=>{calls++;return String(url).includes('/requests/')?Response.json({success:false,code:'request_not_found'},{status:404}):Response.json({success:true,generationId:'memory-job'})};const fallback=await runMeiGenGeneration('image',{prompt:'x',requestId:randomUUID(),wait:false},api(),config);assert.equal(fallback.success,true);assert.match(fallback.receiptWarning,/memory cache/);assert.equal(calls,2);assert.equal((await stat(root)).mode&0o777,0o755);await chmod(root,0o700)}
 const link=join(directory,'symlink-store');await symlink(root,link,process.platform==='win32'?'junction':'dir');process.env.MEIGEN_REQUEST_STORE_DIR=link;assert.match((await runMeiGenGeneration('image',{prompt:'x',requestId:randomUUID(),wait:false},api(),config)).receiptWarning,/not a symlink/)
}))

test('accepted result remains recoverable after failed download; disabling download makes no result request',()=>isolated(async()=>{
 let submits=0,downloads=0
 globalThis.fetch=async(url)=>{
  if(String(url).includes('/requests/'))return submits?Response.json({...complete,generationId:'download-job'}):Response.json({success:false,code:'request_not_found'},{status:404})
  if(String(url).includes('/status/'))return Response.json(complete)
  if(String(url).endsWith('/v2')){submits++;return Response.json({success:true,generationId:'download-job'})}
  downloads++;throw new Error('download network failure')
 }
 const input={prompt:'download',requestId:randomUUID()}
 const result=valid(await runMeiGenGeneration('image',input,api(),config));assert.equal(result.success,true);assert.match(result.downloadWarning,/Local save skipped/);assert.equal(result.generationId,'download-job')
 const retry=await runMeiGenGeneration('image',{...input,download:false},api(),config);assert.equal(retry.success,true);assert.equal(submits,1);assert.equal(downloads,1)
}))

test('four waiting videos do not hold submission slots needed by a first-frame image',()=>isolated(async()=>{
 let submits=0;const polled=[]
 globalThis.fetch=async(url)=>String(url).includes('/requests/')?Response.json({success:false,code:'request_not_found'},{status:404}):Response.json({success:true,generationId:`job-${++submits}`})
 const client=api();client.waitForGeneration=id=>new Promise(resolve=>polled.push(()=>resolve({status:'completed',mediaType:'video',videoUrl:'https://images.meigen.ai/a.mp4',error:null})))
 const pending=Array.from({length:4},()=>runMeiGenGeneration('video',{prompt:'motion',modelId:'video-model',requestId:randomUUID(),download:false},client,config))
 while(polled.length<4)await new Promise(resolve=>setTimeout(resolve,1))
 const frame=await runMeiGenGeneration('image',{prompt:'next frame',requestId:randomUUID(),wait:false},api(),config);assert.equal(frame.status,'processing');assert.equal(submits,5)
 polled.forEach(resolve=>resolve());await Promise.all(pending)
}))

test('same ID concurrent invocations submit once and changing input cannot race the lock',()=>isolated(async()=>{
 let submits=0;globalThis.fetch=async(url)=>{if(String(url).includes('/requests/'))return submits?Response.json({status:'processing',generationId:'one-job'}):Response.json({success:false,code:'request_not_found'},{status:404});submits++;await new Promise(resolve=>setTimeout(resolve,10));return Response.json({success:true,generationId:'one-job'})}
 const input={prompt:'same',requestId:randomUUID(),wait:false}
 const results=await Promise.all([runMeiGenGeneration('image',input,api(),config),runMeiGenGeneration('image',input,api(),config),runMeiGenGeneration('image',{...input,prompt:'changed'},api(),config)])
 const successes=results.filter(result=>result.success);const conflicts=results.filter(result=>!result.success);assert.ok(successes.length>=1);assert.ok(conflicts.length>=1);assert.ok(successes.every(result=>result.generationId==='one-job'));assert.ok(conflicts.every(result=>result.error.code==='idempotency_conflict'));assert.equal(results[0].success,results[1].success);assert.equal(submits,1)
}))

test('cancelled queue entries never acquire later; bounded download enforces streamed bytes and total timeout',async()=>{
 const semaphore=new semaphoreModule.Semaphore(1);await semaphore.acquire();const controller=new AbortController();const pending=semaphore.acquire(controller.signal);controller.abort();await assert.rejects(pending);semaphore.release();await semaphore.acquire();semaphore.release()
 const response=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(4));controller.enqueue(new Uint8Array(4));controller.close()}}));await assert.rejects(boundedBytes(response,6),/size limit/)
 const previous=globalThis.fetch
 globalThis.fetch=async(_url,init)=>new Response(new ReadableStream({start(controller){init.signal.addEventListener('abort',()=>controller.error(init.signal.reason))}}))
 try {await assert.rejects(withHttpResponse('https://download.example',{},10,res=>boundedBytes(res,100)),/timed out/)}finally{globalThis.fetch=previous}
})

test('structured query by requestId carries job URLs, 404 same-ID recovery, retry-after, and top-up action',async()=>{
 const previous=globalThis.fetch
 const requestId=randomUUID();const {run,schema}=tool(checkModule.registerCheckGeneration)
 assert.ok(schema.outputSchema)
 try{
  globalThis.fetch=async(url)=>{assert.equal(String(url),`https://api.example/api/generate/v2/requests/${requestId}`);return Response.json({...complete,generationId:'query-job',creditsStatus:'charged'})}
  const ready=await run({requestId});assert.equal(ready.structuredContent.generationId,'query-job');assert.equal(ready.structuredContent.creditsStatus,'charged');assert.deepEqual(JSON.parse(ready.content[0].text),ready.structuredContent)
  globalThis.fetch=async()=>Response.json({success:false,error:'No receipt',code:'request_not_found'},{status:404});assert.equal((await run({requestId})).structuredContent.nextAction.type,'retry_request')
  globalThis.fetch=async()=>Response.json({success:false,error:'In progress',code:'in_progress',retryable:true},{status:409,headers:{'Retry-After':'7'}});assert.equal((await run({requestId})).structuredContent.pollAfterSeconds,7)
  globalThis.fetch=async()=>Response.json({success:false,error:'Insufficient purchased credits',code:'insufficient_credits',required:8,available:3,retryable:true},{status:402});const payment=(await run({requestId})).structuredContent;assert.equal(payment.nextAction.type,'top_up');assert.equal(payment.error.required,8);assert.match(payment.nextAction.message,/same requestId/)
 }finally{globalThis.fetch=previous}
})

test('unsupported provider submit-only and missing requestId reject before any upload or API request',async()=>{
 const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected')}
 try{
  const {run}=tool(imageModule.registerGenerateImage,api(),{openaiApiKey:'test-byok'})
  for(const provider of ['openai']){const out=await run({prompt:'first frame',provider,wait:false,requestId:randomUUID(),referenceImages:['/nonexistent.png']});assert.equal(out.isError,true)}
  const video=tool(videoModule.registerGenerateVideo).run;const out=await video({prompt:'motion',model:'video',wait:false});assert.equal(out.structuredContent.error.code,'request_id_required');assert.equal(calls,0)
 }finally{globalThis.fetch=previous}
})

test('list_models exposes typed structured capabilities and preserves selected workflow model guidance',async()=>{
 const model={id:'live-video',name:'Video',provider:'test',description:null,credits_per_generation:5,supports_4k:false,supported_ratios:['16:9'],api_provider:'test',request_transform:'test',media_type:'video',extra_config:null}
 const {run,schema}=tool(modelsModule.registerListModels,{listModels:async()=>[model]})
 const result=await run({activeOnly:true});assert.equal(result.structuredContent.models[0].id,'live-video');assert.equal(result.structuredContent.executionCapabilities.maxConcurrentSubmissions,4);assert.equal(z.object(schema.outputSchema).safeParse(result.structuredContent).success,true)
})

test('list_models pricing text follows each declared reference-seconds billing mode', async () => {
 const base={id:'live-video',name:'Video',media_type:'video',supported_ratios:['16:9'],extra_config:{pricingPerSecWithVideo:{'720p':24},minBillableTable:{'5':8}},capabilities:{video:{valid:true,requiresFirstFrame:false,outputDuration:{kind:'enum',values:[5,10],default:5},referenceVideo:{enabled:true,minSeconds:2,maxSeconds:15,maxCount:1,maxTotalSeconds:15,maxUploadBytes:50*1024*1024},billing:{mode:'per_second',requestDefaultSeconds:5}}}}
 for (const mode of ['output_only','reference_plus_output','reference_plus_output_with_minimum_table',undefined]) {
  const model={...base,capabilities:{video:{...base.capabilities.video,billing:{...base.capabilities.video.billing,referenceSeconds:mode}}}}
  const result=await tool(modelsModule.registerListModels,{listModels:async()=>[model]}).run({activeOnly:true})
  const text=result.content.at(-1).text
  if(mode==='output_only') {assert.match(text,/Bill output seconds only/);assert.doesNotMatch(text,/Sum .*input video seconds plus output|minimum billable seconds table/)}
  else if(mode?.startsWith('reference_plus_output')) {assert.match(text,/Sum server-measured input video seconds plus output/);assert.equal(text.includes('minimum billable seconds table'),mode.endsWith('_with_minimum_table'))}
  else {assert.match(text,/do not infer a seconds formula/);assert.doesNotMatch(text,/Sum .*input video seconds plus output/)}
 }
})

test('key rotation revalidates receipt ownership; inaccessible cached job is never returned',()=>isolated(async()=>{
 const requestId=randomUUID();const input={prompt:'rotation',requestId,wait:false};let submits=0
 globalThis.fetch=async(url,init)=>{
  if(String(url).includes('/requests/')){if(!submits)return Response.json({success:false,code:'request_not_found'},{status:404});assert.equal(init.headers.Authorization,'Bearer replacement-test-key');return Response.json({...complete,generationId:'rotated-job'})}
  submits++;return Response.json({success:true,generationId:'rotated-job'})
 }
 await runMeiGenGeneration('image',input,api(),config)
 const rotated={...config,meigenApiToken:'replacement-test-key'}
 const restored=await runMeiGenGeneration('image',input,new MeiGenApiClient(rotated),rotated);assert.equal(restored.status,'completed');assert.equal(restored.generationId,'rotated-job');assert.equal(submits,1)
 globalThis.fetch=async()=>Response.json({success:false,error:'not found',code:'request_not_found'},{status:404})
 const other={...config,meigenApiToken:'other-account-test-key'};const denied=await runMeiGenGeneration('image',input,new MeiGenApiClient(other),other)
 assert.equal(denied.error.code,'request_id_collision');assert.equal(denied.generationId,undefined)
}))

test('a terminal deduped POST returns actual status/URLs even in submit-only mode',()=>isolated(async()=>{
 for(const state of ['completed','failed']){
  globalThis.fetch=async(url)=>String(url).includes('/requests/')?Response.json({success:false,code:'request_not_found'},{status:404}):Response.json({success:true,generationId:`terminal-${state}`,deduped:true,...complete,status:state,creditsStatus:state==='failed'?'refunded':'charged'})
  const body=await runMeiGenGeneration('image',{prompt:'terminal',requestId:randomUUID(),wait:false},api(),config)
  assert.equal(body.status,state);assert.equal(body.creditsStatus,state==='failed'?'refunded':'charged');assert.equal(body.success,state==='completed')
 }
}))

test('model aliases/variants survive the tool and client layers; mismatched aliases are rejected before I/O',()=>isolated(async()=>{
 let calls=0
 globalThis.fetch=async(_url,init)=>{if(String(_url).includes('/requests/'))return Response.json({success:false,code:'request_not_found'},{status:404});calls++;const body=JSON.parse(init.body);assert.equal(body.modelId,'gpt-image-25');assert.equal(body.modelVariant,'sunburst');assert.equal(body.quality,'ultra');return Response.json({success:true,generationId:'variant-job'})}
 const image=tool(imageModule.registerGenerateImage)
 const args={prompt:'exact prompt',modelId:'gpt-image-25',modelVariant:'sunburst',quality:'ultra',requestId:randomUUID(),wait:false,download:false}
 assert.equal(z.object(image.schema.inputSchema).safeParse(args).success,true)
 assert.equal((await image.run(args)).structuredContent.generationId,'variant-job')
 assert.equal((await image.run({...args,model:'different'})).structuredContent.error.code,'model_alias_conflict');assert.equal(calls,1)
 const video=tool(videoModule.registerGenerateVideo);assert.equal((await video.run({prompt:'video',model:'x',modelId:'y',wait:false,requestId:randomUUID()})).structuredContent.error.code,'model_alias_conflict');assert.equal(calls,1)
}))

test('actual HTTP submissions enforce four slots and cancel a fifth queued call without dispatch',async()=>{
 const previous=globalThis.fetch;const pending=[];let sent=0
 globalThis.fetch=(_url,init)=>{sent++;return new Promise(resolve=>pending.push(()=>resolve(Response.json({success:true,generationId:`limited-${JSON.parse(init.body).idempotencyKey}`}))))}
 try{
  const client=api();const calls=Array.from({length:4},()=>client.generateImage({prompt:'bounded'}))
  while(pending.length<4)await new Promise(resolve=>setTimeout(resolve,1))
  const controller=new AbortController();const fifth=client.generateVideo({prompt:'queued',modelId:'video',signal:controller.signal});controller.abort();await assert.rejects(fifth);assert.equal(sent,4)
  pending.forEach(resolve=>resolve());await Promise.all(calls)
  globalThis.fetch=async()=>Response.json({success:true,generationId:'slot-released'});assert.equal((await client.generateImage({prompt:'after'})).generationId,'slot-released')
 }finally{globalThis.fetch=previous}
})

test('private immutable receipt publication across independent processes chooses the same prepared URLs',()=>isolated(async()=>{
 const {spawn}=await import('node:child_process');const requestId=randomUUID();const moduleUrl=new URL('../lib/generation-request-store.ts',import.meta.url).href
 const child=label=>new Promise((resolve,reject)=>{
  const script=`const mod=await import(${JSON.stringify(moduleUrl)});const {withGenerationReceipt}=mod.default??mod;const urls=await withGenerationReceipt(${JSON.stringify(config)},${JSON.stringify(requestId)},'same-bytes',async(receipt,save)=>{receipt.references=['https://images.meigen.ai/'+${JSON.stringify(label)}+'.png'];await new Promise(r=>setTimeout(r,30));await save();return receipt.references});process.stdout.write(JSON.stringify(urls));`
  const processHandle=spawn(process.execPath,['--import','tsx','--input-type=module','-e',script],{cwd:process.cwd(),env:process.env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';processHandle.stdout.on('data',v=>stdout+=v);processHandle.stderr.on('data',v=>stderr+=v);processHandle.on('error',reject);processHandle.on('close',code=>code===0?resolve(JSON.parse(stdout)):reject(new Error(stderr)))
 })
 const [one,two]=await Promise.all([child('process-one'),child('process-two')]);assert.deepEqual(one,two)
}))

test('payment recovery keeps the UUID and prepared inputs; input key order is immaterial',()=>isolated(async()=>{
 const requestId=randomUUID();let submissions=0
 globalThis.fetch=async(url,init)=>{
  if(String(url).includes('/requests/'))return Response.json({success:false,error:'Top up',required:5,available:0,retryable:true},{status:402})
  submissions++;assert.equal(JSON.parse(init.body).idempotencyKey,requestId)
  return submissions===1?Response.json({success:false,error:'Top up',required:5,available:0,retryable:true},{status:402}):Response.json({success:true,generationId:'after-topup'})
 }
 const first=await runMeiGenGeneration('image',{prompt:'pay',modelId:'image',requestId,wait:false},api(),config)
 assert.equal(first.nextAction.type,'top_up')
 const second=await runMeiGenGeneration('image',{wait:false,requestId,modelId:'image',prompt:'pay'},api(),config);assert.equal(second.generationId,'after-topup');assert.equal(submissions,2)
}))

test('BYOK URL-only generation skips remote image download and returns structured result',async()=>{
 const previous=globalThis.fetch;let calls=0
 globalThis.fetch=async(url)=>{calls++;assert.equal(String(url),'https://byok.example/v1/images/generations');return Response.json({data:[{url:'https://byok.example/result.png'}]})}
 try{
  const image=tool(imageModule.registerGenerateImage,api(),{openaiApiKey:'fake-byok-test'})
  const result=await image.run({prompt:'image',provider:'openai',wait:true,download:false})
  assert.equal(result.structuredContent.status,'completed');assert.deepEqual(result.structuredContent.urls,['https://byok.example/result.png']);assert.equal(result.structuredContent.savedPath,undefined);assert.equal(calls,1)
 }finally{globalThis.fetch=previous}
})

test('expired server lease resumes the original POST; positive lease polls and missing generation ID stops polling',()=>isolated(async()=>{
 const requestId=randomUUID();let posts=0;const input={prompt:'lease',requestId,wait:false}
 globalThis.fetch=async(url)=>{
  if(String(url).includes('/requests/'))return Response.json({success:false,error:'Expired lease',code:'in_progress',retryAfterSeconds:0,retryable:true},{status:409})
  posts++;if(posts===1)throw Error('connection lost')
  return Response.json({success:true,generationId:'resumed-after-lease'})
 }
 assert.equal((await runMeiGenGeneration('image',input,api(),config)).success,false)
 assert.equal((await runMeiGenGeneration('image',input,api(),config)).generationId,'resumed-after-lease');assert.equal(posts,2)
 const check=tool(checkModule.registerCheckGeneration).run
 assert.equal((await check({requestId})).structuredContent.nextAction.type,'retry_request')
 globalThis.fetch=async()=>Response.json({success:false,error:'Missing'},{status:410})
 assert.equal((await check({generationId:'gone'})).structuredContent.nextAction.type,'review_missing')
}))

test('deleted original generation stops recovery with either identifier and never authorizes a replacement',()=>isolated(async()=>{
 const requestId=randomUUID();const calls=[];const check=tool(checkModule.registerCheckGeneration).run
 globalThis.fetch=async(url,init)=>{
  calls.push({url:String(url),method:init?.method??'GET'})
  return Response.json({success:false,code:'generation_unavailable',error:'The original generation is no longer available. This request ID cannot start another job.',retryable:false},{status:410})
 }
 for(const identity of [{requestId},{generationId:'deleted-original'}]){
  const output=valid((await check(identity)).structuredContent)
  assert.equal(output.success,false);assert.equal(output.status,'unknown');assert.equal(output.nextAction.type,'review_missing')
  for(const [key,value] of Object.entries(identity))assert.equal(output[key],value)
  assert.equal(output.error.code,'generation_unavailable');assert.equal(output.error.httpStatus,410);assert.equal(output.error.retryable,false)
  assert.match(output.nextAction.message,/Stop automatic polling/);assert.match(output.nextAction.message,/do not assume a replacement generation is authorized/)
 }
 assert.deepEqual(calls,[{url:`https://api.example/api/generate/v2/requests/${requestId}`,method:'GET'},{url:'https://api.example/api/generate/v2/status/deleted-original',method:'GET'}])
}))

test('submit-only checks preserve requested media through processing, errors and completion without replacement charges',()=>isolated(async()=>{
 for(const requestedMediaType of ['image','video']){
  const actual=requestedMediaType==='image'?'video':'image';const requestId=randomUUID();const generationId=`async-${requestedMediaType}`
  const url=`https://images.meigen.ai/${generationId}.${actual==='image'?'png':'mp4'}`;let posts=0;let polls=0
  const identity={generationId,mediaType:actual}
  const completed={...identity,success:true,status:'completed',...(actual==='image'?{imageUrl:url,imageUrls:[url]}:{videoUrl:url})}
  globalThis.fetch=async(input,init)=>{
   const path=new URL(input).pathname
   if(init?.method==='POST'){posts++;assert.equal(path,'/api/generate/v2');return Response.json({...identity,success:true,status:'processing'})}
   if(path.includes('/requests/'))return posts?Response.json(completed):Response.json({success:false,code:'request_not_found'},{status:404})
   assert.equal(path,`/api/generate/v2/status/${generationId}`);polls++
   if(polls===1)return Response.json({...identity,status:'processing'})
   if(polls===2)return Response.json({success:false,code:'status_query_busy',retryable:true},{status:429})
   if(polls===3)return Response.json({success:false,code:'in_progress',retryable:true,retryAfterSeconds:5},{status:409})
   if(polls===4)return Response.json({...identity,status:'completed'})
   return Response.json(completed)
  }
  let output=valid(await runMeiGenGeneration(requestedMediaType,{prompt:'asynchronous media contract',modelId:'selected-model',requestId,wait:false,download:false},api(),config))
  assert.equal(output.mediaType,actual);assert.equal(output.requestedMediaType,requestedMediaType);assert.equal(output.status,'processing')
  const check=tool(checkModule.registerCheckGeneration)
  for(let i=0;i<5;i++){
   assert.equal(output.nextAction.type,'check_generation')
   assert.deepEqual(output.nextAction.arguments,{generationId,requestedMediaType})
   const args=z.object(check.schema.inputSchema).parse(output.nextAction.arguments)
   output=valid((await check.run(args)).structuredContent)
   assert.equal(output.requestedMediaType,requestedMediaType)
  }
  assert.equal(output.success,true);assert.equal(output.status,'completed');assert.equal(output.mediaType,actual);assert.deepEqual(output.urls,[url]);assert.equal(output.nextAction.type,'review_media_type')
  const recovered=valid((await check.run({requestId,requestedMediaType})).structuredContent)
  assert.equal(recovered.nextAction.type,'review_media_type');assert.equal(recovered.mediaType,actual);assert.deepEqual(recovered.urls,[url])
  assert.equal((await check.run({requestId})).structuredContent.nextAction.type,'use_result')
  assert.equal(posts,1)
 }
}))

test('lost submit response retains original media intent in request-ID recovery arguments',()=>isolated(async()=>{
 const requestId=randomUUID();let posts=0
 globalThis.fetch=async(_url,init)=>{
  if(init?.method==='POST'){posts++;throw new TypeError('submit response lost')}
  return Response.json({success:false,code:'request_not_found'},{status:404})
 }
 const output=valid(await runMeiGenGeneration('image',{prompt:'keep intent after interruption',requestId,wait:false},api(),config))
 assert.equal(posts,1);assert.equal(output.nextAction.type,'check_generation');assert.deepEqual(output.nextAction.arguments,{requestId,requestedMediaType:'image'})
 globalThis.fetch=async()=>Response.json({success:false,code:'in_progress',retryable:true,retryAfterSeconds:5},{status:409})
 const checked=valid((await tool(checkModule.registerCheckGeneration).run(output.nextAction.arguments)).structuredContent)
 assert.equal(checked.status,'processing');assert.deepEqual(checked.nextAction.arguments,{requestId,requestedMediaType:'image'});assert.equal(posts,1)
}))

const ISO_MEDIA = Buffer.concat([Buffer.from([0,0,0,0x20]),Buffer.from('ftyp'),Buffer.from('isom'),Buffer.alloc(24,7)])
const WAVE_MEDIA = Buffer.concat([Buffer.from('RIFF'),Buffer.from([0x24,0,0,0]),Buffer.from('WAVE'),Buffer.from('fmt '),Buffer.alloc(16,1)])

test('reference video and audio arrays upload local clips once and reach the API as arrays without the legacy scalar',()=>isolated(async directory=>{
 const clip=join(directory,'clip.mp4'),audio=join(directory,'tone.wav')
 await writeFile(clip,ISO_MEDIA);await writeFile(audio,WAVE_MEDIA)
 const requestId=randomUUID();const bodies=[],presigns=[],puts=[]
 globalThis.fetch=async(url,init)=>{
  if(String(url).includes('/api/upload/reference-video')){presigns.push(JSON.parse(init.body));return Response.json({success:true,presignedUrl:`https://storage.example/put-${presigns.length}`,publicUrl:`https://images.meigen.ai/ref-videos/2026-09-17/${presigns.length}.bin`})}
  if(init?.method==='PUT'){puts.push(Buffer.from(init.body));return new Response(null)}
  if(String(url).includes('/requests/'))return bodies.length?Response.json({success:true,status:'processing',generationId:'video-job'}):Response.json({success:false,code:'request_not_found'},{status:404})
  bodies.push(JSON.parse(init.body));return Response.json({success:true,generationId:'video-job'})
 }
 const video=tool(videoModule.registerGenerateVideo)
 const args={prompt:'Extend this: keep the move of Video 1 and the rhythm of Audio 1',model:'seedance-2-5',referenceVideos:[clip],referenceAudios:[audio],requestId,wait:false,download:false}
 assert.equal(valid((await video.run(args)).structuredContent).generationId,'video-job')
 assert.deepEqual(presigns.map(entry=>entry.kind),['video','audio'])
 assert.deepEqual(presigns.map(entry=>entry.modelId),['seedance-2-5','seedance-2-5'])
 assert.deepEqual(presigns.map(entry=>entry.contentType),['video/mp4','audio/wav'])
 assert.equal(Buffer.compare(puts[0],ISO_MEDIA),0)
 assert.deepEqual(bodies[0].referenceVideos,['https://images.meigen.ai/ref-videos/2026-09-17/1.bin'])
 assert.deepEqual(bodies[0].referenceAudios,['https://images.meigen.ai/ref-videos/2026-09-17/2.bin'])
 assert.equal(Object.hasOwn(bodies[0],'referenceVideo'),false)
 // Write-once receipts: the retry re-uses the published URLs instead of re-uploading or re-charging.
 assert.equal((await video.run(args)).structuredContent.deduped,true)
 assert.equal(presigns.length,2);assert.equal(bodies.length,1)
 const store=join(process.env.MEIGEN_REQUEST_STORE_DIR,createHash('sha256').update(config.meigenBaseUrl).digest('hex'),requestId)
 assert.deepEqual(JSON.parse(await readFile(join(store,'video-references.json'),'utf8')),{references:['https://images.meigen.ai/ref-videos/2026-09-17/1.bin']})
 assert.deepEqual(JSON.parse(await readFile(join(store,'audio-references.json'),'utf8')),{references:['https://images.meigen.ai/ref-videos/2026-09-17/2.bin']})
 assert.deepEqual(JSON.parse(await readFile(join(store,'references.json'),'utf8')),{references:[]})
}))

test('a deprecated referenceVideo that disagrees with referenceVideos is rejected before any dispatch',async()=>{
 let calls=0;const previous=globalThis.fetch
 globalThis.fetch=async()=>{calls++;throw new Error('must not dispatch a contradictory reference set')}
 try{
  const video=tool(videoModule.registerGenerateVideo)
  const result=(await video.run({prompt:'clip',model:'seedance-2-5',referenceVideo:'https://images.meigen.ai/b.mp4',referenceVideos:['https://images.meigen.ai/a.mp4'],requestId:randomUUID(),wait:false})).structuredContent
  assert.equal(result.error.code,'invalid_reference');assert.match(result.error.message,/first entry of referenceVideos/);assert.equal(calls,0)
 }finally{globalThis.fetch=previous}
})

test('the legacy single-clip request keeps its exact body and its pre-existing saved fingerprint',()=>isolated(async()=>{
 const requestId=randomUUID();const referenceVideo='https://images.meigen.ai/clip.mp4';const bodies=[]
 globalThis.fetch=async(url,init)=>{
  if(String(url).includes('/api/upload/reference-video'))throw new Error('a public URL must never be re-uploaded')
  if(String(url).includes('/requests/'))return bodies.length?Response.json({success:true,status:'processing',generationId:'legacy-job'}):Response.json({success:false,code:'request_not_found'},{status:404})
  bodies.push(JSON.parse(init.body));return Response.json({success:true,generationId:'legacy-job'})
 }
 const video=tool(videoModule.registerGenerateVideo)
 const args={prompt:'extend it',model:'seedance-2-0',referenceVideo,requestId,wait:false,download:false}
 assert.equal(valid((await video.run(args)).structuredContent).generationId,'legacy-job')
 // Byte-identical legacy body: the scalar only, in its historical position, with no empty arrays.
 assert.deepEqual(bodies[0],{modelId:'seedance-2-0',prompt:'extend it',aspectRatio:'auto',referenceVideo,idempotencyKey:requestId})
 // An explicitly empty array is not a different request: it must not rewrite the saved identity.
 assert.equal((await video.run({...args,referenceVideos:[],referenceAudios:[]})).structuredContent.deduped,true)
 // Identity published by an older release, recomputed here with the pre-feature formula.
 const historical=createHash('sha256').update(JSON.stringify({mediaType:'video',parameters:{modelId:'seedance-2-0',prompt:'extend it',referenceVideo},references:[]})).digest('hex')
 const store=join(process.env.MEIGEN_REQUEST_STORE_DIR,createHash('sha256').update(config.meigenBaseUrl).digest('hex'),requestId)
 assert.equal(JSON.parse(await readFile(join(store,'identity.json'),'utf8')).fingerprint,historical)
 assert.equal(bodies.length,1)
}))

test('explicit content roles survive upload/recovery and cannot collide with endpoint-only receipts', () => isolated(async () => {
 const posts=[]; let accepted=false
 globalThis.fetch=async(url,init)=>{
  if(String(url).includes('/requests/')) return accepted ? Response.json({success:true,generationId:'video-job',status:'processing',mediaType:'video'}) : Response.json({success:false,code:'request_not_found'},{status:404})
  posts.push(JSON.parse(init.body)); accepted=true; return Response.json({success:true,generationId:'video-job',status:'processing',mediaType:'video'})
 }
 const run=tool(videoModule.registerGenerateVideo).run; const requestId=randomUUID()
 const args={prompt:'content guided clip',model:'seedance-2-5',contentReferenceImages:['https://images.meigen.ai/a.png','https://images.meigen.ai/b.png'],requestId,wait:false,download:false}
 assert.equal((await run(args)).structuredContent.success,true)
 assert.deepEqual(posts[0].contentReferenceImages,args.contentReferenceImages); assert.deepEqual(posts[0].frameReferenceImages,[]); assert.equal(posts[0].strictReferenceRoles,true); assert.equal(posts[0].referenceImages,undefined)
 assert.equal((await run(args)).structuredContent.deduped,true); assert.equal(posts.length,1)
 const changed=await run({...args,contentReferenceImages:[],firstFrame:args.contentReferenceImages[0],lastFrame:args.contentReferenceImages[1]})
 assert.equal(changed.structuredContent.success,false); assert.equal(posts.length,1)
}))


test('HeyGen mixed video/audio fails before upload or submission but recovers existing paid receipts', () => isolated(async () => {
  let existing = false;
  let posts = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/requests/')) return existing
      ? Response.json({ success: true, status: 'processing', generationId: 'already-paid' })
      : Response.json({ success: false, code: 'request_not_found' }, { status: 404 });
    posts++;
    throw new Error('Unexpected upload or paid submission');
  };
  const input = { prompt: 'motion', modelId: 'heygen-video-1', requestId: randomUUID(), wait: false,
    referenceVideos: ['https://images.meigen.ai/ref-videos/clip.mp4'], referenceAudios: ['https://images.meigen.ai/ref-videos/audio.wav'] };
  const result = await runMeiGenGeneration('video', input, api(), config);
  assert.equal(result.error.code, 'reference_video_audio_conflict');
  assert.equal(posts, 0);
  existing = true;
  const recovered = await runMeiGenGeneration('video', input, api(), config);
  assert.equal(recovered.generationId, 'already-paid');
  assert.equal(recovered.deduped, true);
  assert.equal(posts, 0);
}));
