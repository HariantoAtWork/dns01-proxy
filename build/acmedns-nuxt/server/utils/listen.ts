import { existsSync } from 'node:fs'
import { getAcmeConfig } from './config'

export interface ListenTlsOptions {
  certPath: string
  keyPath: string
}

export interface ListenBinding {
  host: string
  port: number
  tls: ListenTlsOptions | null
}

/** HTTP is always bound; HTTPS is optional when `api.tls = "cert"`. */
export interface DualListenOptions {
  http: ListenBinding
  https: ListenBinding | null
}

function parsePort(value: string | undefined, fallback: string): number {
  const raw = value ?? fallback
  const port = Number(raw)
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`invalid API listen port: ${raw}`)
  }
  return port
}

function resolveTlsMaterial(): ListenTlsOptions {
  const config = getAcmeConfig()
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
  return { certPath, keyPath }
}

function formatLocalBase(scheme: 'http' | 'https', port: number): string {
  if ((scheme === 'http' && port === 80) || (scheme === 'https' && port === 443)) {
    return `${scheme}://127.0.0.1`
  }
  return `${scheme}://127.0.0.1:${port}`
}

export function localApiBaseUrl(): string {
  const listen = resolveListenOptions()
  if (listen.https) {
    return formatLocalBase('https', listen.https.port)
  }
  return formatLocalBase('http', listen.http.port)
}

/**
 * Always bind HTTP (default `:80`, or `api.port` when TLS is off).
 * When `api.tls = "cert"`, also bind HTTPS (default `:443` / `api.port`).
 */
export function resolveListenOptions(): DualListenOptions {
  const config = getAcmeConfig()
  const host = process.env.NITRO_HOST || process.env.HOST || config.api.ip || '0.0.0.0'
  const envPort = process.env.NITRO_PORT || process.env.PORT

  if (config.api.tls === 'cert') {
    const tls = resolveTlsMaterial()
    // HTTP stays on 80 (or NITRO_PORT/PORT). HTTPS uses api.port (default 443).
    const httpPort = parsePort(envPort, '80')
    let httpsPort = parsePort(config.api.port, '443')
    if (httpsPort === httpPort) {
      if (httpPort === 80) {
        httpsPort = 443
      }
      else {
        throw new Error(
          `HTTP and HTTPS cannot share port ${httpPort}; set api.port to a distinct HTTPS port`,
        )
      }
    }
    return {
      http: { host, port: httpPort, tls: null },
      https: { host, port: httpsPort, tls },
    }
  }

  if (config.api.tls !== 'none') {
    throw new Error(
      `api.tls "${config.api.tls}" is not supported in acmedns-nuxt (use "none" or "cert")`,
    )
  }

  const httpPort = parsePort(envPort, config.api.port || '80')
  return {
    http: { host, port: httpPort, tls: null },
    https: null,
  }
}
