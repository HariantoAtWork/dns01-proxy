import { existsSync } from 'node:fs'
import { getAcmeConfig } from './config'

export interface ListenTlsOptions {
  certPath: string
  keyPath: string
}

export interface ListenOptions {
  host: string
  port: number
  tls: ListenTlsOptions | null
}

function parsePort(value: string | undefined, fallback: string): number {
  const raw = value ?? fallback
  const port = Number(raw)
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`invalid API listen port: ${raw}`)
  }
  return port
}

export function localApiBaseUrl(): string {
  const config = getAcmeConfig()
  const scheme = config.api.tls === 'cert' ? 'https' : 'http'
  const port = parsePort(config.api.port, scheme === 'https' ? '443' : '80')
  if ((scheme === 'http' && port === 80) || (scheme === 'https' && port === 443)) {
    return `${scheme}://127.0.0.1`
  }
  return `${scheme}://127.0.0.1:${port}`
}

export function resolveListenOptions(): ListenOptions {
  const config = getAcmeConfig()
  const host = process.env.NITRO_HOST || process.env.HOST || config.api.ip || '0.0.0.0'
  const defaultPort = config.api.tls === 'cert' ? '443' : '80'
  const port = parsePort(
    process.env.NITRO_PORT || process.env.PORT,
    config.api.port || defaultPort,
  )

  if (config.api.tls === 'cert') {
    const certPath = config.api.tls_cert_fullchain?.trim()
    const keyPath = config.api.tls_cert_privkey?.trim()
    if (!certPath || !keyPath) {
      throw new Error('api.tls is "cert" but tls_cert_fullchain / tls_cert_privkey are not set')
    }
    if (!existsSync(certPath)) {
      throw new Error(`TLS certificate not found: ${certPath}`)
    }
    if (!existsSync(keyPath)) {
      throw new Error(`TLS private key not found: ${keyPath}`)
    }
    return { host, port, tls: { certPath, keyPath } }
  }

  if (config.api.tls !== 'none') {
    throw new Error(
      `api.tls "${config.api.tls}" is not supported in acmedns-nuxt (use "none" or "cert")`,
    )
  }

  return { host, port, tls: null }
}
