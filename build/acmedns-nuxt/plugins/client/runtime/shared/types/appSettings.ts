export type SettingSource = 'app-settings' | 'compose/env' | 'config.cfg' | 'default'

/** Operator overrides stored on the data volume (wins over compose env). */
export interface AppSettingsFile {
  acmednsUrl?: string
  defaultAcmednsUrl?: string
  letsencryptEmail?: string
  renewInterval?: number
  certsAcmeDisabled?: boolean
  administratorPassword?: string
  tz?: string
}

export interface OperatorSettingsView {
  acmednsUrl: string
  defaultAcmednsUrl: string
  letsencryptEmail: string
  renewInterval: number
  certsAcmeDisabled: boolean
  /** Empty string in GET when unset; never returns stored secret after save — use passwordSet. */
  administratorPassword: string
  passwordSet: boolean
  tz: string
  sources: {
    acmednsUrl: SettingSource
    defaultAcmednsUrl: SettingSource
    letsencryptEmail: SettingSource
    renewInterval: SettingSource
    certsAcmeDisabled: SettingSource
    administratorPassword: SettingSource
    tz: SettingSource
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
    /** Omit or undefined = leave unchanged; empty string = clear password. */
    administratorPassword?: string | null
    tz: string
  }>
  /** When true, remove all keys from app-settings.json (compose env wins). */
  clearOperatorOverrides?: boolean
  general?: Partial<ConfigGeneralView>
  database?: Partial<ConfigDatabaseView>
  api?: Partial<ConfigApiView>
  logconfig?: Partial<ConfigLogView>
}
