#!/usr/bin/env bun
/**
 * Generate an ACMEDNS_TINY_SHARED_KEY (same alphabet/rules as the stack).
 *
 * Usage:
 *   bun script/generate-password.ts
 *   bun script/generate-password.ts 40
 *   ./dc.sh generate-password
 */
import { generatePassword } from '../src/dns01-proxy/server/utils/validation.ts'

const raw = process.argv[2]
const length = raw ? Number(raw) : 40
if (!Number.isFinite(length) || length < 1 || length > 256) {
  console.error('generate-password: length must be 1–256 (default 40)')
  process.exit(1)
}

const password = generatePassword(Math.floor(length))
process.stdout.write(`${password}\n`)
