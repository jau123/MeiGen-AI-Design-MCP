// This is an intentionally pinned internal hook, not a parser for diagnostics.
// Recheck browser/manual OAuth and private-error fixtures before updating mcp-remote.
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const require = createRequire(import.meta.url)
const output = process.stderr.write.bind(process.stderr)
process.stderr.write = (_chunk, encoding, callback) => {
  const done = typeof encoding === 'function' ? encoding : callback
  if (done) queueMicrotask(done)
  return true
}
try {
  const root = dirname(require.resolve('mcp-remote/package.json'))
  if (require(join(root, 'package.json')).version !== '0.16.5') throw new Error('unsupported_dependency')
  const { NodeOAuthClientProvider } = await import(pathToFileURL(join(root, 'dist/chunk-EL3EX2HH.js')).href)
  const redirect = NodeOAuthClientProvider?.prototype.redirectToAuthorization
  const tokens = NodeOAuthClientProvider?.prototype.tokens
  const scopeRequestChanged = NodeOAuthClientProvider?.prototype.scopeRequestChanged
  if (typeof redirect !== 'function' || typeof tokens !== 'function' || typeof scopeRequestChanged !== 'function') throw new Error('missing_auth_hook')
  NodeOAuthClientProvider.prototype.scopeRequestChanged = function (value) {
    // scopes_supported is a capability catalog, not a consent requirement. A
    // Streamable HTTP endpoint may return 405 to discovery GET, with no scope
    // challenge. Preserve its cached grant and let an actual 401/403 request
    // any missing permission. Explicit user scopes still use the original rule.
    const requested = this.requestedScope()
    if (!this.staticOAuthClientMetadata?.scope?.trim() && typeof value?.scope === 'string' && value.scope.trim()) {
      if (!this.wwwAuthenticateScope?.trim()) return false
      const granted = new Set(value.scope.split(/\s+/).filter(Boolean))
      if (requested?.trim() && requested.split(/\s+/).filter(Boolean).every(scope => granted.has(scope))) return false
    }
    return Reflect.apply(scopeRequestChanged, this, [value])
  }
  const grantedScopes = new WeakMap()
  NodeOAuthClientProvider.prototype.tokens = async function (...args) {
    const value = await Reflect.apply(tokens, this, args)
    if (typeof value?.scope === 'string' && value.scope.trim()) grantedScopes.set(this, new Set(value.scope.split(/\s+/).filter(Boolean)))
    return value
  }
  const resource = new URL(process.argv[2])
  NodeOAuthClientProvider.prototype.redirectToAuthorization = async function (url) {
    // 0.16.5 mistakes an explicit step-up matching the advertised scope catalog
    // for its initial default. Preserve only a strict expansion of a grant the
    // provider actually returned; initial authorization and user-pinned scopes
    // continue through the dependency unchanged. This never grants consent.
    const granted = grantedScopes.get(this)
    const requested = url.searchParams.get('scope')
    const requestedSet = new Set((requested ?? '').split(/\s+/).filter(Boolean))
    if (!this.staticOAuthClientMetadata?.scope?.trim() && granted?.size && requestedSet.size > granted.size && [...granted].every(scope => requestedSet.has(scope))) {
      this.wwwAuthenticateScope = requested
    }
    const result = await Reflect.apply(redirect, this, [url])
    // The URL is supplied by the SDK's authorization hook, never an upstream
    // error body. Limit the printable destination and parameters as well.
    const authorization = new URL(String(url))
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(resource.hostname)
    const allowedOrigin = authorization.origin === 'https://www.meigen.ai' || (local && authorization.origin === resource.origin)
    const keys = new Set(['response_type', 'client_id', 'code_challenge', 'code_challenge_method', 'redirect_uri', 'scope', 'state', 'resource'])
    const printable = allowedOrigin && !authorization.username && !authorization.password && !authorization.hash
      && (authorization.pathname === '/oauth/authorize' || (local && authorization.pathname === '/authorize'))
      && [...authorization.searchParams.keys()].every(key => keys.has(key))
      && authorization.searchParams.get('response_type') === 'code'
      && authorization.searchParams.get('code_challenge_method') === 'S256'
      && authorization.href.length <= 8192
    if (printable) output(`MeiGen sign-in: ${authorization.href}\nIf the browser does not open, paste this URL into your browser.\n`)
    else output('MeiGen sign-in requires the authorization browser. The manual URL was not displayed because its format was not recognized.\n')
    return result
  }
  await import(pathToFileURL(join(root, 'dist/proxy.js')).href)
} catch {
  output('MeiGen could not start its OAuth connection. Update the bridge or connect directly to https://www.meigen.ai/api/mcp.\n')
  process.exitCode = 1
}
