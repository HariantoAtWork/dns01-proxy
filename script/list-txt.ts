#!/usr/bin/env bun
/**
 * List DNS TXT records for a hostname, following CNAME hops.
 *
 * Usage:
 *   bun script/list-txt.ts admin.harianto.link
 *   bun script/list-txt.ts admin.harianto.link --acme
 *   bun script/list-txt.ts admin.harianto.link --server 8.8.8.8
 *   bun script/list-txt.ts _acme-challenge.admin.harianto.link --server 1.1.1.1
 */
import { Resolver } from 'node:dns/promises'

const MAX_CNAME_HOPS = 10

type Options = {
  domain: string
  server: string | null
  acme: boolean
}

type Hop = {
  qname: string
  txtValues: string[]
  cnameTarget: string | null
  note: string | null
}

function printHelp(): void {
  console.log(`Usage: bun script/list-txt.ts <domain> [--acme] [--server <ip>]

Follows CNAME hops (like TXT online) and prints TXT at each hop.

Options:
  --acme              Also walk _acme-challenge.<domain>
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
    domain = normaliseName(arg)
  }

  if (!domain) throw new Error('Domain is required (e.g. admin.harianto.link)')
  return { domain, server, acme }
}

function normaliseName(value: string): string {
  return value.replace(/\.$/, '').trim().toLowerCase()
}

function dnsCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code: unknown }).code)
  }
  return null
}

function isEmptyLookup(error: unknown): boolean {
  const code = dnsCode(error)
  return code === 'ENODATA' || code === 'ENOTFOUND'
}

function createResolver(server: string | null): Resolver {
  const resolver = new Resolver()
  if (server) resolver.setServers([server])
  return resolver
}

async function lookupTxt(resolver: Resolver, name: string): Promise<string[]> {
  try {
    const records = await resolver.resolveTxt(name)
    return records.map(chunks => chunks.join('')).filter(Boolean)
  }
  catch (error) {
    if (isEmptyLookup(error)) return []
    throw error
  }
}

async function lookupCname(resolver: Resolver, name: string): Promise<string | null> {
  try {
    const records = await resolver.resolveCname(name)
    const target = records.map(normaliseName).find(Boolean)
    return target ?? null
  }
  catch (error) {
    if (isEmptyLookup(error)) return null
    throw error
  }
}

async function walkTxtChain(resolver: Resolver, startName: string): Promise<Hop[]> {
  const hops: Hop[] = []
  const visited = new Set<string>()
  let current = normaliseName(startName)

  for (let hop = 0; hop < MAX_CNAME_HOPS; hop += 1) {
    if (visited.has(current)) {
      hops.push({
        qname: current,
        txtValues: [],
        cnameTarget: null,
        note: 'CNAME loop',
      })
      break
    }
    visited.add(current)

    const [txtValues, cnameTarget] = await Promise.all([
      lookupTxt(resolver, current),
      lookupCname(resolver, current),
    ])

    hops.push({
      qname: current,
      txtValues,
      cnameTarget,
      note: null,
    })

    if (!cnameTarget) break
    current = cnameTarget
  }

  return hops
}

function printChain(startName: string, hops: Hop[], resolverLabel: string): void {
  console.log(`\n${startName}`)
  console.log(`  resolver: ${resolverLabel}`)

  const allTxt: string[] = []

  for (const [index, hop] of hops.entries()) {
    const label = hops.length > 1 ? `hop ${index + 1}` : 'name'
    console.log(`  ${label}: ${hop.qname}`)
    if (hop.note) {
      console.log(`    ${hop.note}`)
    }
    if (hop.txtValues.length === 0) {
      console.log('    TXT  (none)')
    }
    else {
      for (const value of hop.txtValues) {
        console.log(`    TXT  ${value}`)
        allTxt.push(value)
      }
    }
    if (hop.cnameTarget) {
      console.log(`    CNAME → ${hop.cnameTarget}`)
    }
  }

  if (hops.length > 1) {
    const unique = [...new Set(allTxt)]
    console.log('  all TXT:')
    if (unique.length === 0) {
      console.log('    (none)')
    }
    else {
      for (const value of unique) {
        console.log(`    ${value}`)
      }
    }
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2))
  if (parsed === 'help') {
    printHelp()
    return
  }

  const resolver = createResolver(parsed.server)
  const resolverLabel = resolver.getServers().join(', ') || 'system'
  const names = [parsed.domain]
  if (parsed.acme) names.push(`_acme-challenge.${parsed.domain}`)

  for (const name of names) {
    const hops = await walkTxtChain(resolver, name)
    printChain(name, hops, resolverLabel)
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
