import { startOAuthBridge } from './oauth-bridge.js'
import { connectionConfig } from './config.js'
import { startTokenBridge } from './token-bridge.js'

type Bridge = { close: () => Promise<unknown> }

/** SDK stdio does not emit onclose on host stdin EOF. Own process lifecycle here. */
export async function runStdioBridge(start: () => Promise<Bridge>) {
  let bridge: Bridge | undefined
  let closing = false
  const close = () => { closing = true; return bridge?.close() }
  const onEof = () => { void close() }
  const onSignal = () => { void Promise.resolve(close()).then(() => { if (bridge) process.exit(0) }) }
  process.stdin.once('end', onEof)
  process.stdin.once('close', onEof)
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)
  try {
    bridge = await start()
    if (closing || process.stdin.readableEnded || process.stdin.destroyed) await bridge.close()
    return bridge
  } catch (error) {
    process.stdin.off('end', onEof)
    process.stdin.off('close', onEof)
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    throw error
  }
}

export async function main(args: string[]) {
  if (args.some(arg => arg !== '--oauth') || args.length > 1) throw new Error('Usage: meigen [--oauth]. Use meigen --help for migration options.')
  const config = connectionConfig(process.env, undefined, args.includes('--oauth'))
  if (config.mode === 'api-key') {
    process.stderr.write('MeiGen remote bridge: using your existing API key. Account-library tools require --oauth.\n')
    await runStdioBridge(() => startTokenBridge(new URL(config.url), config.token))
  } else {
    process.stderr.write('MeiGen remote bridge: sign in through the browser when requested. Native remote URL: https://www.meigen.ai/api/mcp\n')
    await runStdioBridge(() => startOAuthBridge(config.url))
  }
}
