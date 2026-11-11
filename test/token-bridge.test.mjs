import test from 'node:test'; import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import bridgeModule from '../src/token-bridge.js';
const token='meigen_sk_test_private';
async function fixture(t) {
 const requests=[];const state={name:'first_tool',fail:false,redirect:false};
 const http=createServer(async(req,res)=>{
  if(req.method!=='POST'){res.writeHead(405).end();return;}
  let body='';for await(const chunk of req)body+=chunk;
  const msg=JSON.parse(body);requests.push({msg,authorization:req.headers.authorization,path:req.url});
  if(state.fail){req.socket.destroy();return;}
  if(state.redirect){res.writeHead(307,{Location:'/wrong'}).end();return;}
  if(!('id'in msg)){res.writeHead(202).end();return;}
  const result=msg.method==='initialize'?{protocolVersion:'2025-11-25',capabilities:{tools:{listChanged:true}},serverInfo:{name:'remote-fixture',version:'99'},instructions:'Remote instructions only'}:
   msg.method==='tools/list'?{tools:[{name:state.name,description:'Fresh remote schema',inputSchema:{type:'object',properties:{requestId:{type:'string'},newField:{type:'string'}},required:['newField']}}]}:
   {content:[{type:'text',text:'fixture'}],structuredContent:{success:true,requestId:msg.params.arguments.requestId,received:msg.params.arguments},_meta:{preserve:'opaque'}};
  res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({jsonrpc:'2.0',id:msg.id,result}));
 });
 await new Promise(r=>http.listen(0,'127.0.0.1',r));
 const [clientSide,serverSide]=InMemoryTransport.createLinkedPair();
 const bridge=await bridgeModule.startTokenBridge(new URL(`http://127.0.0.1:${http.address().port}/mcp`),token,serverSide);
 const client=new Client({name:'bridge-test',version:'1'});
 t.after(async()=>{await client.close();await bridge.close();http.closeAllConnections();await new Promise(r=>http.close(r));});
 await client.connect(clientSide);return {client,state,requests};
}
test('forwards live tools, instructions, schemas and future fields without a package update',async t=>{
 const {client,state,requests}=await fixture(t);
 assert.equal(client.getInstructions(),'Remote instructions only');assert.equal((await client.listTools()).tools[0].name,'first_tool');
 state.name='new_remote_tool';assert.equal((await client.listTools()).tools[0].name,'new_remote_tool');
 const args={newField:'preserve',requestId:'11111111-2222-4333-8444-555555555555',file:{base64:'AAEC'},future:[1,{x:true}]};
 const r=await client.callTool({name:'new_remote_tool',arguments:args});assert.deepEqual(r.structuredContent.received,args);assert.deepEqual(r._meta,{preserve:'opaque'});
 assert.ok(requests.every(r=>r.authorization===`Bearer ${token}`&&r.path==='/mcp'));
});
test('a lost submission is not retried and error preserves recovery guidance',async t=>{
 const {client,state,requests}=await fixture(t);state.fail=true;
 await assert.rejects(()=>client.callTool({name:'generate_image',arguments:{requestId:'preserve-me',newField:'x'}}),/original requestId/);
 assert.equal(requests.filter(r=>r.msg.method==='tools/call').length,1);
});
test('redirects never forward the account key to another path',async t=>{
 const {client,state,requests}=await fixture(t);state.redirect=true;
 await assert.rejects(()=>client.listTools(),/remote request failed/);assert.ok(requests.every(r=>r.path==='/mcp'));
});

test('cached BYOK/download requests cannot silently start a cloud job',async t=>{
 const {client,requests}=await fixture(t);
 for (const args of [{provider:'openai'},{download:true}]) {
  await assert.rejects(()=>client.callTool({name:'generate_image',arguments:{requestId:'cached',...args}}),/3.4.0/);
 }
 assert.equal(requests.filter(r=>r.msg.method==='tools/call').length,0);
});
