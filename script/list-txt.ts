#!/usr/bin/env bun
/**
 * List DNS TXT records for a hostname.
 *
 * Usage:
 *   bun script/list-txt.ts admin.harianto.link
 *   bun script/list-txt.ts admin.harianto.link --acme
 *   bun script/list-txt.ts admin.harianto.link --server 8.8.8.8
 *   bun script/list-txt.ts _acme-challenge.admin.harianto.link --server 127.0.0.1
 */
import { Resolver } from 'node:dns/promises'

type Options = {
  domain: string
  server: string | null
  acme: boolean
}

function printHelp(): void {
  console.log(`Usage: bun script/list-txt.ts <domain> [--acme] [--server <ip>]

Options:
  --acme              Also query _acme-challenge.<domain>
  --server <ip>       Query this nameserver (default: system resolvers)
  -h, --help          Show this help
`)
}

function parseArgs(argv: string[]): Options | 'help' {
  let domain = ''
  let server: string | null = null
  let acme = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '-h' || arg === '--help') return 'help'
    if (arg === '--acme') {
      acme = true
      continue
    }
    if (arg === '--server') {
      const next = argv[++i]
      if (!next) throw new Error('--server needs an IP or hostname')
      server = next
      continue
    }
    if (arg.startsWith('-')) throw new Error(`Unknown flag: ${arg}`)
    if (domain) throw new Error(`Unexpected argument: ${arg}`)
    domain = arg.replace(/\.$/, '')
  }

  if (!domain) throw new Error('Domain is required (e.g. admin.harianto.link)')
  return { domain, server, acme }
}

function createResolver(server: string | null): Resolver {
  const resolver = new Resolver()
  if (server) resolver.setServers([server])
  return resolver
}

async function listTxt(resolver: Resolver, name: string): Promise<void> {
  const servers = resolver.getServers().join(', ') || 'system'
  console.log(`\n${name}`)
  console.log(`  resolver: ${servers}`)

  try {
    const records = await resolver.resolveTxt(name)
    if (records.length === 0) {
      console.log('  (no TXT records)')
      return
    }
    for (const chunks of records) {
      const value = chunks.join('')
      console.log(`  TXT  ${value}`)
    }
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : null
    if (code === 'ENODATA' || code === 'ENOTFOUND') {
      console.log(`  (no TXT records · ${code})`)
      return
    }
    throw error
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2))
  if (parsed === 'help') {
    printHelp()
    return
  }

  const resolver = createResolver(parsed.server)
  const names = [parsed.domain]
  if (parsed.acme) names.push(`_acme-challenge.${parsed.domain}`)

  for (const name of names) {
    await listTxt(resolver, name)
  }
  console.log('')
}

try {
  await main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`list-txt: ${message}`)
  process.exit(1)
}
