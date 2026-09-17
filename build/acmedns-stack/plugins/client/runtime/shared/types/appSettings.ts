export type SettingSource = 'app-settings' | 'compose/env' | 'config.cfg' | 'default'

/** Operator overrides stored on the data volume (wins over compose env). */
export interface AppSettingsFile {
  acmednsUrl?: string
  defaultAcmednsUrl?: string
  letsencryptEmail?: string
  renewInterval?: number
  certsAcmeDisabled?: boolean
  /** When true, stop the periodic production renew timer (manual Apply still works). */
  certsRenewDisabled?: boolean
  /**
   * Dashboard override for tiny/shared mode.
   * Wins over ACMEDNS_TINY_MODE; a non-empty tiny domain still forces shared mode on.
   */
  sharedMode?: boolean
  /**
   * Dashboard override for ACMEDNS_TINY_DOMAIN (auth zone hostname).
   * Wins over compose/env; empty/omit falls back to env.
   */
  tinyDomain?: string
  administratorPassword?: string
  tz?: string
  /** Pause after TXT online before LE validate (ms). 0 disables. Wins over ACME_TXT_SETTLE_MS. */
  acmeTxtSettleMs?: number
  /** Extra challenge TXT retention after settle (ms). Wins over ACME_TXT_HOLD_MS. */
  acmeTxtHoldMs?: number
  /**
   * Opt-in auth hop: dynamic per-authorization CNAME to a UUID TXT terminal.
   * Wins over ACMEDNS_AUTH_HOP / config.cfg api.auth_hop.
   */
  authHop?: boolean
}

export interface OperatorSettingsView {
  acmednsUrl: string
  defaultAcmednsUrl: string
  letsencryptEmail: string
  renewInterval: number
  certsAcmeDisabled: boolean
  certsRenewDisabled: boolean
  /** Empty string in GET when unset; never returns stored secret after save — use passwordSet. */
  administratorPassword: string
  passwordSet: boolean
  tz: string
  acmeTxtSettleMs: number
  acmeTxtHoldMs: number
  /** Opt-in per-authorization UUID CNAME hop (Tiny mode). */
  authHop: boolean
  sources: {
    acmednsUrl: SettingSource
    defaultAcmednsUrl: SettingSource
    letsencryptEmail: SettingSource
    renewInterval: SettingSource
    certsAcmeDisabled: SettingSource
    certsRenewDisabled: SettingSource
    administratorPassword: SettingSource
    tz: SettingSource
    acmeTxtSettleMs: SettingSource
    acmeTxtHoldMs: SettingSource
    authHop: SettingSource
  }
}

export interface ConfigGeneralView {
  listen: string
  protocol: string
  domain: string
  nsname: string
  nsadmin: string
  /** One record per line for the textarea. */
  records: string
  debug: boolean
}

export interface ConfigDatabaseView {
  engine: string
  connection: string
}

export interface ConfigApiView {
  ip: string
  port: string
  disable_registration: boolean
  shared_mode: boolean
  shared_username: string
  /** Never returned after save — use sharedPasswordSet. */
  shared_password: string
  sharedPasswordSet: boolean
  /** Opt-in auth hop (also via ACMEDNS_AUTH_HOP / app-settings). */
  auth_hop: boolean
  tls: string
  /** Required when tls = "cert" — paths inside the container. */
  tls_cert_fullchain: string
  tls_cert_privkey: string
  corsorigins: string
  use_header: boolean
  header_name: string
}

export interface ConfigLogView {
  loglevel: string
  logtype: string
  logformat: string
}

export interface RuntimePathsView {
  dataRoot: string
  letsencryptDir: string
  configCfg: string
  appSettings: string
  acmeDnsListen: string
  host: string
  nitroHost: string
}

export interface AppSettingsResponse {
  operator: OperatorSettingsView
  general: ConfigGeneralView
  database: ConfigDatabaseView
  api: ConfigApiView
  logconfig: ConfigLogView
  paths: RuntimePathsView
  /** True when ACMEDNS_TINY_DOMAIN is set in compose/env (Settings toggle locked). */
  sharedModeForcedByEnv?: boolean
  /** Effective tiny auth domain (dashboard override or ACMEDNS_TINY_DOMAIN). */
  tinyDomain?: string
  tinyDomainSource?: SettingSource
  /** Raw ACMEDNS_TINY_DOMAIN from compose/env (empty when unset). */
  tinyDomainEnv?: string
  restartRequired?: boolean
  restartReasons?: string[]
}

export interface AppSettingsPutBody {
  operator?: Partial<{
    acmednsUrl: string
    defaultAcmednsUrl: string
    letsencryptEmail: string
    renewInterval: number
    certsAcmeDisabled: boolean
    certsRenewDisabled: boolean
    /** Omit or undefined = leave unchanged; empty string = clear password. */
    administratorPassword?: string | null
    tz: string
    /**
     * Tiny auth domain override. Omit = leave unchanged;
     * empty string = clear dashboard override (env may still apply).
     */
    tinyDomain?: string | null
    /** ACME_TXT_SETTLE_MS override (ms). 0 disables settle pause. */
    acmeTxtSettleMs?: number
    /** ACME_TXT_HOLD_MS override (ms). Must be > 0. */
    acmeTxtHoldMs?: number
    /** Opt-in auth hop (per-authorization UUID CNAME). */
    authHop?: boolean
  }>
  /** When true, remove all keys from app-settings.json (compose env wins). */
  clearOperatorOverrides?: boolean
  general?: Partial<ConfigGeneralView>
  database?: Partial<ConfigDatabaseView>
  api?: Partial<ConfigApiView>
  logconfig?: Partial<ConfigLogView>
}
