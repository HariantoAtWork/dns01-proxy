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

function resolveTlsMaterial(): ListenTlsOptions | null {
  const config = getAcmeConfig()
  const certPath = config.api.tls_cert_fullchain?.trim()
  const keyPath = config.api.tls_cert_privkey?.trim()
  if (!certPath || !keyPath) {
    console.warn(
      '[acmedns] api.tls is "cert" but tls_cert_fullchain / tls_cert_privkey are not set — HTTP only',
    )
    return null
  }
  if (!existsSync(certPath)) {
    console.warn(`[acmedns] TLS certificate not found: ${certPath} — HTTP only`)
    return null
  }
  if (!existsSync(keyPath)) {
    console.warn(`[acmedns] TLS private key not found: ${keyPath} — HTTP only`)
    return null
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
    if (tls) {
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
    // Misconfigured cert mode: keep serving HTTP so the dashboard can fix Settings.
  }
  else if (config.api.tls !== 'none') {
    console.warn(
      `[acmedns] api.tls "${config.api.tls}" is not supported (use "none" or "cert") — HTTP only`,
    )
  }

  // When tls=cert failed (no PEMs), keep HTTP on 80 — api.port is meant for HTTPS.
  const httpFallback = config.api.tls === 'cert' ? '80' : (config.api.port || '80')
  const httpPort = parsePort(envPort, httpFallback)
  return {
    http: { host, port: httpPort, tls: null },
    https: null,
  }
}
