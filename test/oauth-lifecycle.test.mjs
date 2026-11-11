import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'

test('OAuth callback shutdown drains a browser preconnect and preserves the response', { timeout: 10000 }, async t => {
  const preload = fileURLToPath(new URL('../bin/oauth-lifecycle.cjs', import.meta.url))
  const script = `
    const http = require('node:http'); const net = require('node:net');
    const server = http.createServer((req,res) => res.end('Authorization successful'));
    server.listen(0,'127.0.0.1',async()=>{
      const port=server.address().port;
      const preconnect=net.connect(port,'127.0.0.1');
      await new Promise(resolve=>preconnect.once('connect',resolve));
      const response=await fetch('http://127.0.0.1:'+port);
      if(await response.text()!=='Authorization successful') process.exitCode=1;
      server.close(()=>{console.log('closed');preconnect.destroy()});
    });`
  const child = spawn(process.execPath, ['--require', preload, '-e', script], { stdio: ['ignore', 'pipe', 'pipe'] })
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM') })
  let stdout = ''; let stderr = ''
  child.stdout.on('data', data => { stdout += data }); child.stderr.on('data', data => { stderr += data })
  const [code] = await once(child, 'exit')
  assert.equal(code, 0, stderr); assert.match(stdout, /closed/)
})
