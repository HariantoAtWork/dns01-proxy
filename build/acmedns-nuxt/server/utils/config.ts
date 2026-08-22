import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'smol-toml'
import type { AcmeDnsConfig, ParsedListen } from './types'

const DEFAULTS: AcmeDnsConfig = {
  general: {
    listen: '0.0.0.0:53',
    protocol: 'both',
    domain: 'auth.example.org',
    nsname: 'auth.example.org',
    nsadmin: 'admin.example.org',
    records: [],
    debug: false,
  },
  database: {
    engine: 'sqlite',
    connection: '/var/lib/acme-dns/acme-dns.db',
  },
  api: {
    ip: '0.0.0.0',
    port: '80',
    disable_registration: false,
    tls: 'none',
    corsorigins: ['*'],
    use_header: false,
    header_name: 'X-Forwarded-For',
  },
  logconfig: {
    loglevel: 'info',
    logtype: 'stdout',
    logformat: 'text',
  },
}

let cached: AcmeDnsConfig | null = null

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback
  }
  return value.filter((item): item is string => typeof item === 'string')
}

export function parseListenAddress(listen: string): ParsedListen {
  const trimmed = listen.trim()
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']')
    if (end > 0) {
      const host = trimmed.slice(1, end)
      const rest = trimmed.slice(end + 1)
      const port = rest.startsWith(':') ? Number(rest.slice(1)) : 53
      return { host, port: Number.isFinite(port) ? port : 53 }
    }
  }
  const idx = trimmed.lastIndexOf(':')
  if (idx > 0) {
    const host = trimmed.slice(0, idx)
    const port = Number(trimmed.slice(idx + 1))
    return { host, port: Number.isFinite(port) ? port : 53 }
  }
  return { host: trimmed || '0.0.0.0', port: 53 }
}

function prepareConfig(raw: Record<string, unknown>): AcmeDnsConfig {
  const general = (raw.general ?? {}) as Record<string, unknown>
  const database = (raw.database ?? {}) as Record<string, unknown>
  const api = (raw.api ?? {}) as Record<string, unknown>
  const logconfig = (raw.logconfig ?? {}) as Record<string, unknown>

  const engine = asString(database.engine, DEFAULTS.database.engine)
  const connection = asString(database.connection, DEFAULTS.database.connection)
  if (!engine) {
    throw new Error('missing database configuration option "engine"')
  }
  if (!connection) {
    throw new Error('missing database configuration option "connection"')
  }

  const normalisedEngine = engine === 'sqlite3' ? 'sqlite' : engine
  if (normalisedEngine !== 'sqlite') {
    throw new Error(`unsupported database engine "${engine}" (sqlite only in acmedns-nuxt v1)`)
  }

  return {
    general: {
      listen: asString(general.listen, DEFAULTS.general.listen),
      protocol: asString(general.protocol, DEFAULTS.general.protocol),
      domain: asString(general.domain, DEFAULTS.general.domain),
      nsname: asString(general.nsname, DEFAULTS.general.nsname),
      nsadmin: asString(general.nsadmin, DEFAULTS.general.nsadmin),
      records: asStringArray(general.records, DEFAULTS.general.records),
      debug: asBool(general.debug, DEFAULTS.general.debug),
    },
    database: {
      engine: normalisedEngine,
      connection,
    },
    api: {
      ip: asString(api.ip, DEFAULTS.api.ip),
      port: asString(api.port, DEFAULTS.api.port),
      disable_registration: asBool(api.disable_registration, DEFAULTS.api.disable_registration),
      tls: asString(api.tls, DEFAULTS.api.tls),
      corsorigins: asStringArray(api.corsorigins, DEFAULTS.api.corsorigins),
      use_header: asBool(api.use_header, DEFAULTS.api.use_header),
      header_name: asString(api.header_name, DEFAULTS.api.header_name),
    },
    logconfig: {
      loglevel: asString(logconfig.loglevel, DEFAULTS.logconfig.loglevel),
      logtype: asString(logconfig.logtype, DEFAULTS.logconfig.logtype),
      logformat: asString(logconfig.logformat, DEFAULTS.logconfig.logformat),
    },
  }
}

export async function loadAcmeConfig(configPath?: string): Promise<AcmeDnsConfig> {
  if (cached) {
    return cached
  }

  const runtime = useRuntimeConfig()
  const resolved = configPath
    || process.env.ACME_DNS_CONFIG
    || process.env.NUXT_ACME_DNS_CONFIG
    || (runtime.acmeDnsConfig as string)
    || '/etc/acme-dns/config.cfg'

  if (!existsSync(resolved)) {
    throw new Error(`Configuration file not found: ${resolved}`)
  }

  const text = readFileSync(resolved, 'utf8')
  const raw = parse(text) as Record<string, unknown>
  cached = prepareConfig(raw)

  // Resolve relative sqlite paths against process cwd (compose mounts use absolute paths).
  if (!cached.database.connection.startsWith('/')) {
    cached.database.connection = resolve(process.cwd(), cached.database.connection)
  }

  // Dev overrides so local dig does not need root on :53
  const listenOverride = process.env.ACME_DNS_LISTEN || process.env.DNS_LISTEN
  const portOverride = process.env.ACME_DNS_PORT || process.env.DNS_PORT
  if (listenOverride || portOverride) {
    const parsed = parseListenAddress(cached.general.listen)
    const host = listenOverride || parsed.host
    const port = portOverride ? Number(portOverride) : parsed.port
    cached.general.listen = `${host}:${Number.isFinite(port) ? port : parsed.port}`
  }

  return cached
}

export function getAcmeConfig(): AcmeDnsConfig {
  if (!cached) {
    throw new Error('acme-dns config not loaded yet')
  }
  return cached
}

export function resetAcmeConfigCache() {
  cached = null
}
