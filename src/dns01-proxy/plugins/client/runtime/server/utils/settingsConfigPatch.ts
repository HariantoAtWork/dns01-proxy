import type {
  ConfigApiView,
  ConfigDatabaseView,
  ConfigGeneralView,
  ConfigLogView,
} from '#shared/types/appSettings'
import type { AcmeDnsConfig } from '../../../../../server/utils/types'
import { resolveTinyDomain } from './appSettings'

export function parseRecordsText(raw: string): string[] {
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
}

export function parseCorsText(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  }
  catch {
    return false
  }
}

export function applyGeneral(config: AcmeDnsConfig, patch: Partial<ConfigGeneralView>) {
  if (patch.listen !== undefined) {
    config.general.listen = String(patch.listen).trim() || config.general.listen
  }
  if (patch.protocol !== undefined) {
    config.general.protocol = String(patch.protocol).trim() || config.general.protocol
  }
  const lockAuthZone = config.api.shared_mode || Boolean(resolveTinyDomain().value)
  if (patch.domain !== undefined && !lockAuthZone) {
    config.general.domain = String(patch.domain).trim() || config.general.domain
  }
  if (patch.nsname !== undefined && !lockAuthZone) {
    config.general.nsname = String(patch.nsname).trim() || config.general.nsname
  }
  if (patch.nsadmin !== undefined) {
    config.general.nsadmin = String(patch.nsadmin).trim() || config.general.nsadmin
  }
  if (patch.records !== undefined) {
    config.general.records = parseRecordsText(String(patch.records))
  }
  if (patch.debug !== undefined) {
    config.general.debug = Boolean(patch.debug)
  }
}

export function applyDatabase(config: AcmeDnsConfig, patch: Partial<ConfigDatabaseView>) {
  if (patch.engine !== undefined) {
    const engine = String(patch.engine).trim()
    if (engine !== 'sqlite' && engine !== 'sqlite3') {
      throw createError({ statusCode: 400, statusMessage: 'database.engine must be sqlite' })
    }
    config.database.engine = engine === 'sqlite3' ? 'sqlite' : engine
  }
  if (patch.connection !== undefined) {
    const connection = String(patch.connection).trim()
    if (!connection) {
      throw createError({ statusCode: 400, statusMessage: 'database.connection is required' })
    }
    config.database.connection = connection
  }
}

export function applyApi(config: AcmeDnsConfig, patch: Partial<ConfigApiView>) {
  if (patch.ip !== undefined) {
    config.api.ip = String(patch.ip).trim() || config.api.ip
  }
  if (patch.port !== undefined) {
    config.api.port = String(patch.port).trim() || config.api.port
  }
  if (patch.disable_registration !== undefined) {
    config.api.disable_registration = Boolean(patch.disable_registration)
  }
  if (patch.shared_mode !== undefined) {
    config.api.shared_mode = Boolean(patch.shared_mode)
    if (config.api.shared_mode) {
      config.api.disable_registration = true
    }
  }
  if (patch.auth_hop !== undefined) {
    config.api.auth_hop = Boolean(patch.auth_hop)
  }
  if (patch.shared_username !== undefined) {
    config.api.shared_username = String(patch.shared_username).trim() || config.api.shared_username
  }
  if (patch.shared_password !== undefined) {
    config.api.shared_password = String(patch.shared_password).trim()
  }
  if (patch.tls !== undefined) {
    const tls = String(patch.tls).trim() || config.api.tls
    if (tls !== 'none' && tls !== 'cert') {
      throw createError({
        statusCode: 400,
        statusMessage: 'api.tls must be "none" or "cert" (letsencrypt modes are not supported here)',
      })
    }
    config.api.tls = tls
  }
  if (patch.tls_cert_fullchain !== undefined) {
    config.api.tls_cert_fullchain = String(patch.tls_cert_fullchain).trim()
  }
  if (patch.tls_cert_privkey !== undefined) {
    config.api.tls_cert_privkey = String(patch.tls_cert_privkey).trim()
  }
  if (patch.corsorigins !== undefined) {
    config.api.corsorigins = parseCorsText(String(patch.corsorigins))
  }
  if (patch.use_header !== undefined) {
    config.api.use_header = Boolean(patch.use_header)
  }
  if (patch.header_name !== undefined) {
    config.api.header_name = String(patch.header_name).trim() || config.api.header_name
  }

  if (config.api.tls === 'cert') {
    const fullchain = (config.api.tls_cert_fullchain || '').trim()
    const privkey = (config.api.tls_cert_privkey || '').trim()
    if (!fullchain || !privkey) {
      throw createError({
        statusCode: 400,
        statusMessage: 'tls = "cert" requires tls_cert_fullchain and tls_cert_privkey (container paths)',
      })
    }
  }
}

export function applyLog(config: AcmeDnsConfig, patch: Partial<ConfigLogView>) {
  if (patch.loglevel !== undefined) {
    config.logconfig.loglevel = String(patch.loglevel).trim() || config.logconfig.loglevel
  }
  if (patch.logtype !== undefined) {
    config.logconfig.logtype = String(patch.logtype).trim() || config.logconfig.logtype
  }
  if (patch.logformat !== undefined) {
    config.logconfig.logformat = String(patch.logformat).trim() || config.logconfig.logformat
  }
}
