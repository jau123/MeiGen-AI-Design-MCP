import { join } from 'node:path'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { connectTransports } from './bridge.js'

/** The pinned OAuth transport is bundled as a dependency, never fetched through npx at runtime. */
export async function startOAuthBridge(url: string, local: Transport = new StdioServerTransport()) {
  const env = getDefaultEnvironment()
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'MCP_REMOTE_CONFIG_DIR', 'BROWSER']) {
    if (process.env[key]) env[key] = process.env[key]!
  }
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--require', join(__dirname, '../bin/oauth-lifecycle.cjs'), join(__dirname, '../bin/oauth-bootstrap.mjs'), url, '--transport', 'http-only', '--auth-timeout', '300', '--enable-proxy'],
    stderr: 'pipe', env,
  })
  // The owned bootstrap suppresses all dependency diagnostics. Only a validated
  // URL from its actual OAuth hook and our fixed messages can reach this pipe.
  transport.stderr?.on('data', chunk => process.stderr.write(chunk))
  return connectTransports(local, transport)
}
