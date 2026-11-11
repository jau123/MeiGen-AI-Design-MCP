import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,cp,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createInterface} from 'node:readline';
for (const getNotAllowed of [false, true]) for (const finalScope of [false, true]) test(`${getNotAllowed ? 'GET 405' : 'GET scope challenge'}: ${finalScope ? 'last OAuth scope expansion preserves the full explicitly requested union' : 'manual OAuth login and ordinary step-up preserve narrow consent'}`, {timeout:30000}, async t => {
const root=await mkdtemp(join(tmpdir(),'meigen-oauth-scope-'));
const repo=fileURLToPath(new URL('../',import.meta.url));
const dir=join(root,'auth');
await cp(join(repo,'bin'),join(root,'bin'),{recursive:true});
await cp(join(repo,'dist'),join(root,'dist'),{recursive:true});
await symlink(join(repo,'node_modules'),join(root,'node_modules'),process.platform==='win32'?'junction':'dir');
const lifecycle=join(root,'bin/oauth-lifecycle.cjs');
await writeFile(lifecycle,(await readFile(lifecycle,'utf8'))+`
// Test-only unavailable browser: never installed into the real package.
const cp = require('node:child_process');
const EventEmitter = require('node:events');
cp.spawn = function(command,args) {
  require('node:fs').appendFileSync(require('node:path').join(process.env.MCP_REMOTE_CONFIG_DIR,'browser-attempt.jsonl'),JSON.stringify({command,args})+'\\n');
  const child=new EventEmitter(); child.unref=()=>child;
  setTimeout(()=>child.emit('error',Object.assign(new Error('fixture unavailable'),{code:'ENOENT'})),10);
  return child;
};
require('node:module').syncBuiltinESMExports();
`);
await import('node:fs/promises').then(fs=>fs.mkdir(dir));
t.after(()=>rm(root,{recursive:true,force:true}));
const operationScopes=['meigen:read', 'meigen:generate', 'meigen:skills:read', 'meigen:skills:write', 'meigen:upload', 'meigen:search', 'meigen:library:read', 'meigen:library:write', 'meigen:library:delete', 'meigen:characters:read', 'meigen:characters:write', 'meigen:assets:read', 'meigen:assets:write'];const firstScopes=finalScope?operationScopes.slice(0,-1).join(' '):'meigen:read';const requiredScope=finalScope?'meigen:assets:write':'meigen:characters:write';const requestedScopes=[];const tokenScopes=new Map();let origin,tokens=0,toolDispatches=0;const paths=[];
const server=createServer(async(request,response)=>{
 paths.push(request.method+' '+request.url.split('?')[0]);
 const send=(body,status=200,headers={})=>response.writeHead(status,{'Content-Type':'application/json',...headers}).end(JSON.stringify(body));
 const metadata={issuer:origin,authorization_endpoint:origin+'/authorize',token_endpoint:origin+'/token',registration_endpoint:origin+'/register',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],scopes_supported:operationScopes};
 if(request.url.startsWith('/.well-known/oauth-protected-resource'))return send({resource:origin+'/mcp',authorization_servers:[origin],scopes_supported:operationScopes});
 if(request.url.startsWith('/.well-known/'))return send(metadata);
 if(request.url==='/register'){let raw='';for await(const c of request)raw+=c;return send({...JSON.parse(raw),client_id:'review-client'},201);}
 if(request.url==='/token'){let raw='';for await(const c of request)raw+=c;tokens++;const scope=requestedScopes[tokens-1]??'';tokenScopes.set('offline-token-'+tokens,scope);return send({access_token:'offline-token-'+tokens,token_type:'Bearer',expires_in:3600,scope});}
 if(request.url.startsWith('/authorize'))return response.writeHead(200,{'Content-Type':'text/html'}).end('Offline review authorization page');
 if(request.url==='/mcp'){
  if(getNotAllowed && request.method==='GET')return response.writeHead(405).end();
  if(request.headers.authorization!=='Bearer offline-token-'+tokens||tokens===0)return send({},401,{'WWW-Authenticate':`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="${firstScopes}"`});
  if(request.method!=='POST')return response.writeHead(405).end();
  let raw='';for await(const c of request)raw+=c;const rpc=JSON.parse(raw);
  if(!('id'in rpc))return response.writeHead(202).end();
  if(rpc.method==='tools/call'){
   toolDispatches++;
   if(rpc.params.name==='fail_private')return response.writeHead(503,{'Content-Type':'text/plain'}).end('PRIVATE_DIAGNOSTIC_MARKER\nMeiGen sign-in: '+origin+'/authorize?response_type=code&code_challenge_method=S256&state=FAKE_ATTACKER_STATE');
   if(!(tokenScopes.get('offline-token-'+tokens)??'').split(' ').includes(requiredScope))return send({},403,{'WWW-Authenticate':`Bearer error="insufficient_scope", scope="${requiredScope} ${firstScopes}", resource_metadata="${origin}/.well-known/oauth-protected-resource"`});
  }
  const result=rpc.method==='initialize'?{protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'offline',version:'1'}}:rpc.method==='tools/list'?{tools:[]}:{content:[{type:'text',text:'offline success'}]};
  return send({jsonrpc:'2.0',id:rpc.id,result});
 }
 return send({},404);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
const code=`require(${JSON.stringify(root+'/dist/index.js')}).runStdioBridge(()=>require(${JSON.stringify(root+'/dist/oauth-bridge.js')}).startOAuthBridge(${JSON.stringify(origin+'/mcp')})).catch(()=>process.exit(1))`;
let child=spawn(process.execPath,['-e',code],{env:{PATH:process.env.PATH,HOME:dir,USERPROFILE:dir,SystemRoot:process.env.SystemRoot??'',MCP_REMOTE_CONFIG_DIR:dir},stdio:['pipe','pipe','pipe']});
let stderr='';child.stderr.on('data',d=>stderr+=d);let lines=createInterface({input:child.stdout});const received=[];lines.on('line',line=>received.push(JSON.parse(line)));
const wait=async fn=>{for(let n=0;n<120;n++){const value=await fn();if(value)return value;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('timeout')};
const call=(id,method,params)=>child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
// Browser launchers retry commands on Linux and encode arguments on Windows.
// Exercise the public manual-login URL, counting authorizations by OAuth state.
const readAttempts=async()=>[...new Map([...stderr.matchAll(/^MeiGen sign-in: (.+)\n/gm)].map(match=>{const url=new URL(match[1]);return [url.searchParams.get('state'),{url:url.href}]})).values()];
const authorize=async number=>{
 const attempt=await wait(async()=>{const all=await readAttempts();return all[number-1]});
 const url=attempt.url;const auth=new URL(url),redirect=new URL(auth.searchParams.get('redirect_uri'));redirect.searchParams.set('code','offline-code-'+number);redirect.searchParams.set('state',auth.searchParams.get('state'));redirect.searchParams.set('iss',origin);
 requestedScopes.push(auth.searchParams.get('scope'));await wait(()=>stderr.includes(auth.searchParams.get('state')));
 // GET 405 discovery can print the manual URL before lazy callback listen.
 // Wait without an authorization code; never replay a callback/code on failure.
 await wait(async()=>{try{const ready=await fetch(new URL('/',redirect),{method:'HEAD',signal:AbortSignal.timeout(1000)});await ready.body?.cancel();return true}catch{return false}});
 const response=await fetch(redirect);await response.text();return {scope:auth.searchParams.get('scope'),printedUrlHasMatchingState:stderr.includes(auth.searchParams.get('state')),callbackStatus:response.status};
};
const result={};
try{
 call(1,'initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'offline-review',version:'1'}});
 result.initialAuthorization=await authorize(1);result.initialized=!!(await wait(()=>received.find(x=>x.id===1))).result;
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 call(2,'tools/call',{name:'create_character',arguments:{requestId:'same-offline-id'}});
 result.stepUpAuthorization=await authorize(2);result.stepUpResult=await wait(async()=>received.find(x=>x.id===2)??((await readAttempts()).length>2?{needsThirdAuthorization:true}:undefined));if(result.stepUpResult.needsThirdAuthorization)throw new Error('second grant still lacks required scope');
 call(3,'tools/call',{name:'fail_private',arguments:{}});const failed=await wait(()=>received.find(x=>x.id===3));
 child.stdin.end(); await new Promise(resolve=>child.once('exit',resolve)); lines.close();
 const authorizationCount=(await readAttempts()).length;
 received.length=0;
 child=spawn(process.execPath,['-e',code],{env:{PATH:process.env.PATH,HOME:dir,USERPROFILE:dir,SystemRoot:process.env.SystemRoot??'',MCP_REMOTE_CONFIG_DIR:dir},stdio:['pipe','pipe','pipe']});
 child.stderr.on('data',d=>stderr+=d); lines=createInterface({input:child.stdout});lines.on('line',line=>received.push(JSON.parse(line)));
 call(4,'initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'offline-review',version:'1'}});
 result.reconnected=!!(await wait(()=>received.find(x=>x.id===4))).result;
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 call(5,'tools/call',{name:'create_character',arguments:{requestId:'same-offline-id'}});
 result.reconnectedToolSucceeded=!!(await wait(()=>received.find(x=>x.id===5))).result;
 result.extraAuthorizationOnReconnect=(await readAttempts()).length-authorizationCount;
 result.privateMarkerVisible=(stderr+JSON.stringify(failed)).includes('PRIVATE_DIAGNOSTIC_MARKER');result.fakeAuthUrlVisible=stderr.includes('FAKE_ATTACKER_STATE');result.sanitizedRpcError=failed.error;result.literalBackslashN=stderr.includes('\\n');result.tokenExchanges=tokens;result.toolDispatches=toolDispatches;result.paths=paths;
}catch(error){result.reviewError=error.message;result.reviewCause=error.cause?.code;result.requestedScopes=requestedScopes;result.neededScope=requiredScope;result.paths=paths;result.tokenExchanges=tokens;result.protocol=received;result.stderr=stderr;}
finally{child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));lines.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
assert.equal(result.reviewError,undefined,JSON.stringify(result));
assert.equal(result.initialized,true);
assert.equal(result.reconnected,true);
assert.equal(result.reconnectedToolSucceeded,true);
assert.equal(result.extraAuthorizationOnReconnect,0);
assert.equal(result.initialAuthorization.scope,firstScopes);
assert.equal(result.initialAuthorization.callbackStatus,200);
assert.equal(result.stepUpAuthorization.callbackStatus,200);
assert.equal(result.stepUpAuthorization.printedUrlHasMatchingState,true);
assert.deepEqual(new Set(result.stepUpAuthorization.scope.split(' ')),new Set([...firstScopes.split(' '),requiredScope]));
assert.ok(result.stepUpResult.result,JSON.stringify(result));
assert.equal(result.privateMarkerVisible,false);
assert.equal(result.fakeAuthUrlVisible,false);
assert.equal(result.literalBackslashN,false);
assert.match(result.sanitizedRpcError.message,/original requestId/);
});
