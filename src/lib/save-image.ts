/**
 * Save a base64-encoded image to the local filesystem.
 *
 * Default directory:
 *   - `MEIGEN_OUTPUT_DIR` env var (highest priority, supports `~` expansion;
 *     useful for sandboxed hosts like OpenClaw where `~/Pictures` is unreachable).
 *   - `XDG_PICTURES_DIR` env var (Linux convention).
 *   - `~/Pictures/meigen/` (macOS/Windows convention; Linux without XDG falls
 *     back here — directory is created lazily).
 *
 * Returns the absolute file path on success, or `undefined` on any IO failure
 * (callers should treat this as best-effort — the caller already has the
 * remote URL as the canonical artifact).
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { randomBytes } from 'crypto'

function expandTilde(p: string): string {
  return p.startsWith('~') ? homedir() + p.slice(1) : p
}

function pickOutputDir(): string {
  const custom = process.env.MEIGEN_OUTPUT_DIR
  if (custom) return expandTilde(custom)
  const xdgPictures = process.env.XDG_PICTURES_DIR
  if (xdgPictures) return join(expandTilde(xdgPictures), 'meigen')
  return join(homedir(), 'Pictures', 'meigen')
}

export function saveImageLocally(base64: string, mimeType: string): string | undefined {
  try {
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg'
    const date = new Date().toISOString().slice(0, 10)
    const id = randomBytes(4).toString('hex')
    const filename = `${date}_${id}.${ext}`
    const dir = pickOutputDir()
    mkdirSync(dir, { recursive: true })
    const filePath = join(dir, filename)
    writeFileSync(filePath, Buffer.from(base64, 'base64'))
    return filePath
  } catch {
    return undefined
  }
}
