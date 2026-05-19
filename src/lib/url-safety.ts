/**
 * Defense-in-depth URL filtering for user-supplied `referenceImages` URLs.
 *
 * The backend providers (gpt-image-2, midjourney, etc.) fetch these URLs
 * server-side to download the reference image. Without a URL filter, an
 * attacker could pass `http://169.254.169.254/` (cloud metadata) or
 * `http://10.x.x.x/` (private network) to exfiltrate internal data. The
 * backend SHOULD also filter these, but MCP adds a client-side guard so we
 * don't accidentally relay clearly-unsafe URLs.
 *
 * Returns a human-readable rejection reason if the URL is unsafe, or `null`
 * if it should be allowed through.
 */

// WHATWG URL parser hostname for IPv6 always wraps in `[]`, and IPv4-mapped IPv6
// (e.g. ::ffff:169.254.169.254) is normalized to hex (::ffff:a9fe:a9fe). All IPv6
// patterns must anchor on `\[`.
const PRIVATE_HOST_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^localhost$/i, reason: 'localhost is not reachable from the backend' },
  { pattern: /^127\./, reason: 'loopback addresses (127.x) are not reachable from the backend' },
  { pattern: /^10\./, reason: 'private network address (10.x) blocked for safety' },
  { pattern: /^192\.168\./, reason: 'private network address (192.168.x) blocked for safety' },
  { pattern: /^172\.(1[6-9]|2[0-9]|3[01])\./, reason: 'private network address (172.16-31.x) blocked for safety' },
  { pattern: /^169\.254\./, reason: 'link-local / cloud-metadata address (169.254.x) blocked for safety' },
  { pattern: /^0\.0\.0\.0$/, reason: 'wildcard address 0.0.0.0 blocked for safety' },
  { pattern: /^::1$/, reason: 'IPv6 loopback (::1) is not reachable from the backend' },
  { pattern: /^\[::1\]$/, reason: 'IPv6 loopback (::1) is not reachable from the backend' },
  { pattern: /^\[::\]$/, reason: 'IPv6 unspecified ([::]) is not reachable from the backend' },
  { pattern: /^\[::ffff:/i, reason: 'IPv4-mapped IPv6 ([::ffff:*]) blocked — can be used to bypass IPv4 filters' },
  { pattern: /^\[fe[89ab][0-9a-f]:/i, reason: 'IPv6 link-local (fe80::/10) blocked for safety' },
  { pattern: /^\[f[cd][0-9a-f]{2}:/i, reason: 'IPv6 unique local address (fc00::/7) blocked for safety' },
]

/**
 * Check if a `referenceImages` URL is safe to relay to the backend.
 * Returns the rejection reason, or null when safe.
 */
export function unsafeReferenceUrlReason(input: string): string | null {
  // Empty / null treated as "safe" (caller will catch separately).
  if (!input) return null

  const lower = input.toLowerCase()

  // Reject non-http(s) schemes outright. file://, data:, ftp:, gopher: etc.
  // are never valid reference image sources for cloud generation.
  if (lower.startsWith('file:')) return 'file:// URLs cannot be fetched by the backend'
  if (lower.startsWith('data:')) return 'data: URIs are not supported — pass a public URL or local path instead'
  // We allow http and https; anything else (ftp, gopher, javascript, etc.) is rejected.
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
    return 'reference URLs must use http:// or https://'
  }

  // Parse the hostname for private-IP checks.
  let host: string
  try {
    host = new URL(input).hostname
  } catch {
    return 'malformed URL'
  }

  for (const { pattern, reason } of PRIVATE_HOST_PATTERNS) {
    if (pattern.test(host)) return reason
  }

  return null
}
