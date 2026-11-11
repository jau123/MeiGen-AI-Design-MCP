#!/usr/bin/env node
/** Validate the maintained OpenClaw Skill frontmatter. */

import { readFileSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

let errors = 0
const fail = (file, msg) => {
  console.error(`::error file=${relative(ROOT, file)}::${msg}`)
  errors++
}

function parseFrontmatter(file) {
  const text = readFileSync(file, 'utf8')
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return null
  const body = m[1]
  const fields = {}
  // Crude line-level scan — sufficient for required-key presence checks.
  // Multi-line block scalars (>- / |) are detected as the key being present.
  for (const line of body.split('\n')) {
    const km = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:/)
    if (km) fields[km[1]] = true
  }
  return fields
}

function checkSkills() {
  // OpenClaw guides
  const skillFiles = [
    join(ROOT, 'openclaw', 'SKILL.md'),
  ]
  for (const file of skillFiles) {
    if (!statSync(file, { throwIfNoEntry: false })) continue
    const fm = parseFrontmatter(file)
    if (!fm) {
      fail(file, 'Missing frontmatter (---...---)')
      continue
    }
    for (const required of ['name', 'description', 'version']) {
      if (!fm[required]) fail(file, `Skill frontmatter missing required field: ${required}`)
    }
  }
}

checkSkills()

if (errors) {
  console.error(`\nFrontmatter lint failed: ${errors} error(s).`)
  process.exit(1)
}
console.log('Frontmatter lint passed.')
