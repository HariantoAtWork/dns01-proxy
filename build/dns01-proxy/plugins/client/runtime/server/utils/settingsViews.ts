import type {
  AppSettingsResponse,
  ConfigApiView,
  ConfigDatabaseView,
  ConfigGeneralView,
  ConfigLogView,
  OperatorSettingsView,
} from '#shared/types/appSettings'
import type { AcmeDnsConfig } from '../../../../../server/utils/types'
import { getAcmeConfig } from '../../../../../server/utils/config'
import {
  getAppSettingsPath,
  getDataRoot,
  getLetsencryptDir,
  getServerConfigPath,
} from '../../../../../server/utils/paths'
import { tinyDomainFromEnv } from '#shared/utils/tinyDomain'
import {
  resolveAcmednsUrl,
  resolveAdministratorPassword,
  resolveCertsAcmeDisabled,
  resolveCertsRenewDisabled,
  resolveDefaultAcmednsUrl,
  resolveLetsencryptEmail,
  resolveRenewIntervalHours,
  resolveTimezone,
  resolveTinyDomain,
} from './appSettings'
import { envAcmeDnsListen, envAcmednsSharedKey } from '../../../../../core/env'
import {
  resolveAcmeTxtHoldMsSource,
  resolveAcmeTxtSettleMsSource,
} from '../../../../txt-ttl/runtime/shared/txtTtlConstants'
import { resolveAuthHopEnabledSource } from '#shared/utils/authHopEnv'

export function buildOperatorView(): OperatorSettingsView {
  const acmednsUrl = resolveAcmednsUrl()
  const defaultAcmednsUrl = resolveDefaultAcmednsUrl()
  const letsencryptEmail = resolveLetsencryptEmail()
  const renewInterval = resolveRenewIntervalHours()
  const certsAcmeDisabled = resolveCertsAcmeDisabled()
  const certsRenewDisabled = resolveCertsRenewDisabled()
  const administratorPassword = resolveAdministratorPassword()
  const tz = resolveTimezone()
  const acmeTxtSettleMs = resolveAcmeTxtSettleMsSource()
  const acmeTxtHoldMs = resolveAcmeTxtHoldMsSource()
  const authHopShared = resolveAuthHopEnabledSource()
  // Mirror server isAuthHopEnabled: config.cfg when app-settings/env unset.
  let authHop = authHopShared
  if (authHopShared.source === 'default') {
    const cfgHop = Boolean(getAcmeConfig().api.auth_hop)
    if (cfgHop) {
      authHop = { value: true, source: 'config.cfg' }
    }
  }

  return {
    acmednsUrl: acmednsUrl.value,
    defaultAcmednsUrl: defaultAcmednsUrl.value,
    letsencryptEmail: letsencryptEmail.value,
    renewInterval: renewInterval.value,
    certsAcmeDisabled: certsAcmeDisabled.value,
    certsRenewDisabled: certsRenewDisabled.value,
    administratorPassword: '',
    passwordSet: administratorPassword.value.length > 0,
    tz: tz.value,
    acmeTxtSettleMs: acmeTxtSettleMs.value,
    acmeTxtHoldMs: acmeTxtHoldMs.value,
    authHop: authHop.value,
    sources: {
      acmednsUrl: acmednsUrl.source,
      defaultAcmednsUrl: defaultAcmednsUrl.source,
      letsencryptEmail: letsencryptEmail.source,
      renewInterval: renewInterval.source,
      certsAcmeDisabled: certsAcmeDisabled.source,
      certsRenewDisabled: certsRenewDisabled.source,
      administratorPassword: administratorPassword.source,
      tz: tz.source,
      acmeTxtSettleMs: acmeTxtSettleMs.source,
      acmeTxtHoldMs: acmeTxtHoldMs.source,
      authHop: authHop.source,
    },
  }
}

export function configToViews(config: AcmeDnsConfig) {
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
    shared_mode: config.api.shared_mode,
    shared_username: config.api.shared_username,
    shared_password: '',
    sharedPasswordSet: Boolean(
      config.api.shared_password
      || envAcmednsSharedKey(),
    ),
    auth_hop: Boolean(config.api.auth_hop),
    tls: config.api.tls,
    tls_cert_fullchain: config.api.tls_cert_fullchain || '',
    tls_cert_privkey: config.api.tls_cert_privkey || '',
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
  const tiny = resolveTinyDomain()
  return {
    operator: buildOperatorView(),
    ...configToViews(config),
    paths: {
      dataRoot: getDataRoot(),
      letsencryptDir: getLetsencryptDir(),
      configCfg: getServerConfigPath(),
      appSettings: getAppSettingsPath(),
      acmeDnsListen: envAcmeDnsListen() || '',
      host: process.env.HOST || '',
      nitroHost: process.env.NITRO_HOST || '',
    },
    // Only compose/env ACMEDNS_TINY_DOMAIN locks the toggle; dashboard tiny domain does not.
    sharedModeForcedByEnv: Boolean(tinyDomainFromEnv()),
    tinyDomain: tiny.value,
    tinyDomainSource: tiny.source,
    tinyDomainEnv: tinyDomainFromEnv(),
  }
}
