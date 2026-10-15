import test from 'node:test'
import assert from 'node:assert/strict'
import { MeiGenApiClient } from '../lib/meigen-api.ts'
import { registerRenderVideoDraft, generateVideoSchema } from './generate-video.ts'
import { generationStatusOutput } from '../lib/generation-operation.ts'
const requestId = '11111111-2222-4333-8444-555555555555'
const config = { meigenBaseUrl: 'https://www.meigen.ai', meigenApiToken: 'meigen_sk_test' }

test('draft is opt-in and backend forwarding preserves ordinary omission', async () => {
  assert.equal(generateVideoSchema.draft.parse(undefined), undefined)
  const api = new MeiGenApiClient(config)
  const original = globalThis.fetch; const calls=[]
  globalThis.fetch = async (url,init) => { calls.push({url:String(url),body:JSON.parse(init.body)}); return Response.json({success:true,generationId:requestId}) }
  try {
    await api.generateVideo({ prompt:'bird',modelId:'seedance-2-5',requestId })
    await api.generateVideo({ prompt:'bird',modelId:'seedance-2-5',requestId,draft:true })
    assert.equal(Object.hasOwn(calls[0].body,'draft'),false)
    assert.equal(calls[1].body.draft,true)
    await api.renderVideoDraft({ requestId, sourceDraftGenerationId:requestId,confirmedCredits:450 })
    assert.equal(calls[2].url,'https://www.meigen.ai/api/generate/v2/draft-final')
    assert.deepEqual(calls[2].body,{idempotencyKey:requestId,sourceDraftGenerationId:requestId,confirmedCredits:450})
  } finally { globalThis.fetch=original }
})
test('draft results keep quote and expiry while stripping vendor identifiers', () => {
  const result=generationStatusOutput({status:'completed',mediaType:'video',videoUrl:'https://images.meigen.ai/a.mp4',seedanceDraft:{stage:'draft',duration:5,referenceVideoSeconds:0,hasReferenceVideo:false,finalCredits:450,taskId:'private-secret'}},{requestId})
  assert.equal(result.seedanceDraft.finalCredits,450)
  assert.equal(JSON.stringify(result).includes('private-secret'),false)
})
test('uncertain final submission keeps the request ID and never retries automatically', async () => {
  let run,calls=0
  registerRenderVideoDraft({registerTool:(_name,_definition,handler)=>{run=handler}}, {renderVideoDraft:async()=>{calls++;throw new Error('interrupted')}})
  const result=await run({requestId,sourceDraftGenerationId:requestId,confirmedCredits:450},{signal:new AbortController().signal})
  assert.equal(calls,1)
  assert.equal(result.structuredContent.requestId,requestId)
  assert.equal(result.structuredContent.nextAction.tool,'check_generation')
})
