export interface AcmeDnsConfig {
  general: {
    listen: string
    protocol: string
    domain: string
    nsname: string
    nsadmin: string
    records: string[]
    debug: boolean
  }
  database: {
    engine: string
    connection: string
  }
  api: {
    ip: string
    port: string
    disable_registration: boolean
    tls: string
    tls_cert_privkey?: string
    tls_cert_fullchain?: string
    acme_cache_dir?: string
    notification_email?: string
    corsorigins: string[]
    use_header: boolean
    header_name: string
  }
  logconfig: {
    loglevel: string
    logtype: string
    logformat: string
  }
}

export interface AcmeTxtPost {
  subdomain: string
  txt: string
}

export interface AcmeTxtAccount {
  username: string
  /** bcrypt hash when loaded from DB; plaintext only at registration time */
  password: string
  subdomain: string
  allowfrom: string[]
}

export interface RegResponse {
  username: string
  password: string
  fulldomain: string
  subdomain: string
  allowfrom: string[]
}

export interface ParsedListen {
  host: string
  port: number
}
