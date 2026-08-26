import type {
  AppSettingsFile,
  AppSettingsPutBody,
  AppSettingsResponse,
  ConfigApiView,
  ConfigDatabaseView,
  ConfigGeneralView,
  ConfigLogView,
  OperatorSettingsView,
} from '#shared/types/appSettings'
import type { AcmeDnsConfig } from '../../../../../server/utils/types'
import { getAcmeConfig } from '../../../../../server/utils/config'
import { bindRestartReasons, writeAcmeConfigFile } from '../../../../../server/utils/configWrite'
import {
  getAppSettingsPath,
  getDataRoot,
  getLetsencryptDir,
  getServerConfigPath,
} from '../../../../../server/utils/paths'
import {
  clearAppSettingsFile,
  readAppSettingsFile,
  resolveAcmednsUrl,
  resolveAdministratorPassword,
  resolveCertsAcmeDisabled,
  resolveDefaultAcmednsUrl,
  resolveLetsencryptEmail,
  resolveRenewIntervalHours,
  resolveTimezone,
  writeAppSettingsFile,
} from './appSettings'

function parseRecordsText(raw: string): string[] {
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
}

function parseCorsText(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  }
  catch {
    return false
  }
}

function buildOperatorView(): OperatorSettingsView {
  const acmednsUrl = resolveAcmednsUrl()
  const defaultAcmednsUrl = resolveDefaultAcmednsUrl()
  const letsencryptEmail = resolveLetsencryptEmail()
  const renewInterval = resolveRenewIntervalHours()
  const certsAcmeDisabled = resolveCertsAcmeDisabled()
  const administratorPassword = resolveAdministratorPassword()
  const tz = resolveTimezone()

  return {
    acmednsUrl: acmednsUrl.value,
    defaultAcmednsUrl: defaultAcmednsUrl.value,
    letsencryptEmail: letsencryptEmail.value,
    renewInterval: renewInterval.value,
    certsAcmeDisabled: certsAcmeDisabled.value,
    administratorPassword: '',
    passwordSet: administratorPassword.value.length > 0,
    tz: tz.value,
    sources: {
      acmednsUrl: acmednsUrl.source,
      defaultAcmednsUrl: defaultAcmednsUrl.source,
      letsencryptEmail: letsencryptEmail.source,
      renewInterval: renewInterval.source,
      certsAcmeDisabled: certsAcmeDisabled.source,
      administratorPassword: administratorPassword.source,
      tz: tz.source,
    },
  }
}

function configToViews(config: AcmeDnsConfig) {
  const general: ConfigGeneralView = {
    listen: config.general.listen,
    protocol: config.general.protocol,
    domain: config.general.domain,
    nsname: config.general.nsname,
    nsadmin: config.general.nsadmin,
    records: config.general.records.join('\n'),
    debug: config.general.debug,
  }
  const database: ConfigDatabaseView = {
    engine: config.database.engine,
    connection: config.database.connection,
  }
  const api: ConfigApiView = {
    ip: config.api.ip,
    port: String(config.api.port),
    disable_registration: config.api.disable_registration,
    tls: config.api.tls,
    corsorigins: config.api.corsorigins.join('\n'),
    use_header: config.api.use_header,
    header_name: config.api.header_name,
  }
  const logconfig: ConfigLogView = {
    loglevel: config.logconfig.loglevel,
    logtype: config.logconfig.logtype,
    logformat: config.logconfig.logformat,
  }
  return { general, database, api, logconfig }
}

export function getAppSettingsResponse(): AppSettingsResponse {
  const config = getAcmeConfig()
  return {
    operator: buildOperatorView(),
    ...configToViews(config),
    paths: {
      dataRoot: getDataRoot(),
      letsencryptDir: getLetsencryptDir(),
      configCfg: getServerConfigPath(),
      appSettings: getAppSettingsPath(),
      acmeDnsListen: process.env.ACME_DNS_LISTEN || process.env.DNS_LISTEN || '',
      host: process.env.HOST || '',
      nitroHost: process.env.NITRO_HOST || '',
    },
  }
}

function applyGeneral(config: AcmeDnsConfig, patch: Partial<ConfigGeneralView>) {
  if (patch.listen !== undefined) {
    config.general.listen = String(patch.listen).trim() || config.general.listen
  }
  if (patch.protocol !== undefined) {
    config.general.protocol = String(patch.protocol).trim() || config.general.protocol
  }
  if (patch.domain !== undefined) {
    config.general.domain = String(patch.domain).trim() || config.general.domain
  }
  if (patch.nsname !== undefined) {
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

function applyDatabase(config: AcmeDnsConfig, patch: Partial<ConfigDatabaseView>) {
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

function applyApi(config: AcmeDnsConfig, patch: Partial<ConfigApiView>) {
  if (patch.ip !== undefined) {
    config.api.ip = String(patch.ip).trim() || config.api.ip
  }
  if (patch.port !== undefined) {
    config.api.port = String(patch.port).trim() || config.api.port
  }
  if (patch.disable_registration !== undefined) {
    config.api.disable_registration = Boolean(patch.disable_registration)
  }
  if (patch.tls !== undefined) {
    config.api.tls = String(patch.tls).trim() || config.api.tls
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
}

function applyLog(config: AcmeDnsConfig, patch: Partial<ConfigLogView>) {
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

async function applyOperator(patch: NonNullable<AppSettingsPutBody['operator']>, clear: boolean) {
  if (clear) {
    await clearAppSettingsFile()
    return
  }

  const current = await readAppSettingsFile()
  const next: AppSettingsFile = { ...current }

  if (patch.acmednsUrl !== undefined) {
    const value = String(patch.acmednsUrl).trim().replace(/\/$/, '')
    if (value && !isHttpUrl(value)) {
      throw createError({ statusCode: 400, statusMessage: 'ACMEDNS_URL must be an http(s) URL' })
    }
    if (value) {
      next.acmednsUrl = value
    }
    else {
      delete next.acmednsUrl
    }
  }
  if (patch.defaultAcmednsUrl !== undefined) {
    const value = String(patch.defaultAcmednsUrl).trim().replace(/\/$/, '')
    if (value && !isHttpUrl(value)) {
      throw createError({ statusCode: 400, statusMessage: 'Default ACMEDNS URL must be an http(s) URL' })
    }
    if (value) {
      next.defaultAcmednsUrl = value
    }
    else {
      delete next.defaultAcmednsUrl
    }
  }
  if (patch.letsencryptEmail !== undefined) {
    const value = String(patch.letsencryptEmail).trim()
    if (value) {
      next.letsencryptEmail = value
    }
    else {
      delete next.letsencryptEmail
    }
  }
  if (patch.renewInterval !== undefined) {
    const n = Number(patch.renewInterval)
    if (!Number.isFinite(n) || n <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'RENEW_INTERVAL must be a positive number' })
    }
    next.renewInterval = n
  }
  if (patch.certsAcmeDisabled !== undefined) {
    next.certsAcmeDisabled = Boolean(patch.certsAcmeDisabled)
  }
  if (patch.tz !== undefined) {
    const value = String(patch.tz).trim()
    if (value) {
      next.tz = value
    }
    else {
      delete next.tz
    }
  }
  if (patch.administratorPassword !== undefined && patch.administratorPassword !== null) {
    next.administratorPassword = String(patch.administratorPassword)
  }

  await writeAppSettingsFile(next)
}

export async function updateAppSettings(body: AppSettingsPutBody): Promise<AppSettingsResponse> {
  const before = JSON.parse(JSON.stringify(getAcmeConfig())) as ReturnType<typeof getAcmeConfig>
  let configTouched = false

  if (body.clearOperatorOverrides || body.operator) {
    await applyOperator(body.operator || {}, Boolean(body.clearOperatorOverrides))
  }

  const next = JSON.parse(JSON.stringify(getAcmeConfig())) as ReturnType<typeof getAcmeConfig>
  if (body.general) {
    applyGeneral(next, body.general)
    configTouched = true
  }
  if (body.database) {
    applyDatabase(next, body.database)
    configTouched = true
  }
  if (body.api) {
    applyApi(next, body.api)
    configTouched = true
  }
  if (body.logconfig) {
    applyLog(next, body.logconfig)
    configTouched = true
  }

  let restartReasons: string[] = []
  if (configTouched) {
    restartReasons = bindRestartReasons(before, next)
    await writeAcmeConfigFile(next)
  }

  const response = getAppSettingsResponse()
  if (restartReasons.length) {
    response.restartRequired = true
    response.restartReasons = restartReasons
  }
  return response
}
