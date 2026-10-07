import {
  existsSync,
  readFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'smol-toml'
import type { AcmeDnsConfig, ParsedListen } from './types'
import { DEFAULT_ACME_DNS_CONFIG_TEMPLATE } from './defaultConfig'
import { findPackageRoot } from './paths'
import { ensureServerConfigSeeded, seedDataRootSync } from './seedData'
import { getAppSettingsSnapshot, resolveTinyDomain } from '../../core/appSettings'
import {
  envAcmeDnsListen,
  envAcmeDnsPort,
  envAcmednsSharedKey,
  envAcmednsTinyMode,
} from '../../core/env'

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
    connection: '/var/lib/dns01-proxy/server/acme-dns.db',
  },
  api: {
    ip: '0.0.0.0',
    port: '80',
    disable_registration: false,
    shared_mode: false,
    shared_username: '00000000-0000-4000-8000-000000000001',
    shared_password: '',
    auth_hop: false,
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
    throw new Error(`unsupported database engine "${engine}" (sqlite only in dns01-proxy v1)`)
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
      shared_mode: asBool(api.shared_mode, DEFAULTS.api.shared_mode),
      shared_username: asString(api.shared_username, DEFAULTS.api.shared_username),
      shared_password: asString(api.shared_password, DEFAULTS.api.shared_password),
      auth_hop: asBool(api.auth_hop, DEFAULTS.api.auth_hop),
      tls: asString(api.tls, DEFAULTS.api.tls),
      tls_cert_privkey: asString(api.tls_cert_privkey, ''),
      tls_cert_fullchain: asString(api.tls_cert_fullchain, ''),
      acme_cache_dir: asString(api.acme_cache_dir, ''),
      notification_email: asString(api.notification_email, ''),
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

function tryRuntimeDefaultConfig(): string | undefined {
  try {
    const value = useRuntimeConfig().acmeDnsDefaultConfig
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
  }
  catch {
    return undefined
  }
}

export function loadAcmeConfigSync(configPath?: string): AcmeDnsConfig {
  if (cached) {
    return cached
  }

  const root = findPackageRoot()
  seedDataRootSync()
  const resolved = ensureServerConfigSeeded(
    tryRuntimeDefaultConfig(),
    DEFAULT_ACME_DNS_CONFIG_TEMPLATE,
    configPath,
  )

  if (!existsSync(resolved)) {
    throw new Error(`Configuration file not found: ${resolved} (root ${root})`)
  }

  const text = readFileSync(resolved, 'utf8')
  cached = prepareConfig(parse(text) as Record<string, unknown>)

  if (!cached.database.connection.startsWith('/')) {
    cached.database.connection = resolve(root, cached.database.connection)
  }

  const listenOverride = envAcmeDnsListen()
  const portOverride = envAcmeDnsPort()
  if (listenOverride || portOverride) {
    const parsed = parseListenAddress(cached.general.listen)
    const host = listenOverride || parsed.host
    const port = portOverride ? Number(portOverride) : parsed.port
    cached.general.listen = `${host}:${Number.isFinite(port) ? port : parsed.port}`
  }

  const tinyDomain = resolveTinyDomain().value
  if (tinyDomain) {
    cached.general.domain = tinyDomain
    cached.general.nsname = tinyDomain
    cached.api.shared_mode = true
    cached.api.disable_registration = true
  }

  const sharedEnv = envAcmednsTinyMode()
  if (sharedEnv === true) {
    cached.api.shared_mode = true
    cached.api.disable_registration = true
  }
  const sharedKey = envAcmednsSharedKey()
  if (sharedKey) {
    cached.api.shared_password = sharedKey
  }

  // Dashboard sharedMode override beats ACMEDNS_TINY_MODE (not a set tiny domain).
  if (!tinyDomain) {
    const snap = getAppSettingsSnapshot()
    if (typeof snap.sharedMode === 'boolean') {
      cached.api.shared_mode = snap.sharedMode
      if (snap.sharedMode) {
        cached.api.disable_registration = true
      }
    }
  }

  if (cached.api.shared_mode) {
    cached.api.disable_registration = true
  }

  console.info(
    `[acmedns] config ${resolved} domain=${cached.general.domain} listen=${cached.general.listen}`
    + (cached.api.shared_mode ? ' shared_mode=true' : '')
    + (tinyDomain ? ` tiny_domain=${tinyDomain}` : ''),
  )
  return cached
}

export async function loadAcmeConfig(configPath?: string): Promise<AcmeDnsConfig> {
  return loadAcmeConfigSync(configPath)
}

export function getAcmeConfig(): AcmeDnsConfig {
  return loadAcmeConfigSync()
}

export function resetAcmeConfigCache() {
  cached = null
}
