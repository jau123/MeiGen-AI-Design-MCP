import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'

// Migration checks only. Current tool schemas and business behavior belong to the remote server.
function migrationError(message: JSONRPCMessage): string | undefined {
  if (!('method' in message) || message.method !== 'tools/call') return
  const args = message.params?.arguments
  if (!args || typeof args !== 'object' || Array.isArray(args)) return
  if ('provider' in args && args.provider !== 'meigen') return 'Local BYOK is available in meigen@3.4.0 only. This connection uses MeiGen purchased credits. Refresh tools and explicitly choose MeiGen before submitting.'
  if ('download' in args && args.download === true) return 'Automatic local downloads are available in meigen@3.4.0 only. This connection returns remote result URLs. Refresh tools before submitting.'
}

/** Forward protocol messages without a local tool catalog, argument rewriting or paid retries. */
export async function connectTransports(local: Transport, remote: Transport) {
  let closed = false
  let initializing: string | number | undefined
  let closePromise: Promise<unknown> | undefined
  const close = () => {
    if (!closePromise) {
      closed = true
      // Defer close callbacks so reentrant onclose shares this same promise.
      closePromise = Promise.resolve().then(() => Promise.allSettled([local.close(), remote.close()]))
    }
    return closePromise
  }
  const fail = async (message: JSONRPCMessage, reason = 'MeiGen remote request failed. Check the connection and recover any submitted task with its original requestId; do not create a replacement automatically.') => {
    if ('id' in message && 'method' in message) await local.send({ jsonrpc: '2.0', id: message.id,
      error: { code: -32000, message: reason } }).catch(() => close())
  }
  local.onmessage = message => {
    if (closed) return
    const error = migrationError(message)
    if (error) { void fail(message, error); return }
    if ('method' in message && message.method === 'initialize' && 'id' in message) initializing = message.id
    void remote.send(message).catch(() => fail(message))
  }
  remote.onmessage = message => {
    if (closed) return
    if ('result' in message && message.id === initializing && typeof message.result.protocolVersion === 'string') {
      remote.setProtocolVersion?.(message.result.protocolVersion)
      local.setProtocolVersion?.(message.result.protocolVersion)
    }
    // Dependency transport errors may include raw HTTP bodies or headers. Business
    // CallToolResult errors are inside result and keep their structured contract.
    const safe = 'error' in message ? { jsonrpc: '2.0' as const, id: message.id, error: { code: message.error.code, message: 'MeiGen remote request failed. Check the connection and recover any submitted task with its original requestId.' } } : message
    void local.send(safe).catch(() => close())
  }
  remote.onerror = () => { process.stderr.write('MeiGen remote transport error. Preserve the original requestId and query task status; no automatic resubmission.\n') }
  local.onerror = () => { void close() }
  local.onclose = remote.onclose = () => { void close() }
  try { await remote.start(); await local.start() }
  catch (error) { await close(); throw error }
  return { close }
}
