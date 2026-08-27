/** Trimmed non-empty env value, or undefined. */
export function envTrimmed(key: string): string | undefined {
  const value = process.env[key]
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed || undefined
}

/** First non-empty trimmed value from the given keys. */
export function envFirst(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = envTrimmed(key)
    if (value) {
      return value
    }
  }
  return undefined
}

export function envTruthy(key: string): boolean | undefined {
  const raw = envTrimmed(key)
  if (raw === undefined) {
    return undefined
  }
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase())
}

export function envAcmednsDataRoot(): string | undefined {
  return envFirst('ACMEDNS_DATA_ROOT', 'NUXT_ACMEDNS_DATA_ROOT')
}

export function envAcmednsLetsencryptDir(): string | undefined {
  return envFirst('ACMEDNS_LETSENCRYPT_DIR', 'NUXT_ACMEDNS_LETSENCRYPT_DIR')
}

export function envAcmednsUrl(): string | undefined {
  return envFirst('NUXT_ACMEDNS_URL', 'ACMEDNS_URL')
}

export function envDefaultAcmednsUrl(): string | undefined {
  return envFirst('NUXT_PUBLIC_DEFAULT_ACMEDNS_URL', 'ACMEDNS_URL')
}

export function envAcmednsTinyDomain(): string | undefined {
  return envTrimmed('ACMEDNS_TINY_DOMAIN')
}

export function envAcmednsSharedMode(): boolean | undefined {
  const raw = envTrimmed('ACMEDNS_SHARED_MODE')
  if (raw === undefined) {
    return undefined
  }
  return raw === 'true' || raw === '1'
}

export function envAcmednsSharedKey(): string | undefined {
  return envTrimmed('ACMEDNS_SHARED_KEY')
}

export function envAcmeDnsListen(): string | undefined {
  return envFirst('ACME_DNS_LISTEN', 'DNS_LISTEN')
}

export function envAcmeDnsPort(): string | undefined {
  return envFirst('ACME_DNS_PORT', 'DNS_PORT')
}

export function envLetsencryptEmail(): string | undefined {
  return envFirst('LETSENCRYPT_EMAIL', 'NUXT_LETSENCRYPT_EMAIL')
}

export function envRenewInterval(): string | undefined {
  return envFirst('RENEW_INTERVAL', 'NUXT_RENEW_INTERVAL')
}

export function envCertsAcmeDisabled(): boolean | undefined {
  return envTruthy('CERTS_ACME_DISABLED') ?? envTruthy('NUXT_CERTS_ACME_DISABLED')
}

export function envCertsRenewDisabled(): boolean | undefined {
  return envTruthy('CERTS_RENEW_DISABLED') ?? envTruthy('NUXT_CERTS_RENEW_DISABLED')
}

export function envAdministratorPassword(): string | undefined {
  return envFirst('ADMINISTRATOR_PASSWORD', 'NUXT_ADMINISTRATOR_PASSWORD')
}

export function envTimezone(): string | undefined {
  return envTrimmed('TZ')
}

export function envAcmednsPublicIp(): string | undefined {
  return envTrimmed('ACMEDNS_PUBLIC_IP')
}

export function envAcmednsPublicIpv6(): string | undefined {
  return envTrimmed('ACMEDNS_PUBLIC_IPV6')
}
