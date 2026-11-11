import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { connectTransports } from './bridge.js'

/** A fixed key must never fall back to another OAuth account. */
export async function startTokenBridge(url: URL, token: string, local: Transport = new StdioServerTransport()) {
  return connectTransports(local, new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    fetch: (input, init) => fetch(input, { ...init, redirect: 'error' }),
  }))
}
