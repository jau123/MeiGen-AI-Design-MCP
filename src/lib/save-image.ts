/**
 * Save a base64-encoded image to the local filesystem.
 *
 * Default directory: ~/Pictures/meigen/
 * Override via `MEIGEN_OUTPUT_DIR` env var (useful for sandboxed hosts like
 * OpenClaw). `~` prefix expansion is supported.
 *
 * Returns the absolute file path on success, or `undefined` on any IO failure
 * (callers should treat this as best-effort — the caller already has the
 * remote URL as the canonical artifact).
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { randomBytes } from 'crypto'

export function saveImageLocally(base64: string, mimeType: string): string | undefined {
  try {
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg'
    const date = new Date().toISOString().slice(0, 10)
    const id = randomBytes(4).toString('hex')
    const filename = `${date}_${id}.${ext}`
    const custom = process.env.MEIGEN_OUTPUT_DIR
    const dir = custom
      ? (custom.startsWith('~') ? homedir() + custom.slice(1) : custom)
      : join(homedir(), 'Pictures', 'meigen')
    mkdirSync(dir, { recursive: true })
    const filePath = join(dir, filename)
    writeFileSync(filePath, Buffer.from(base64, 'base64'))
    return filePath
  } catch {
    return undefined
  }
}
