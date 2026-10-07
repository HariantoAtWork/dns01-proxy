import { existsSync } from 'node:fs'
import { getAcmeConfig } from './config'

export type ListenRole = 'edge' | 'control'

export interface ListenTlsOptions {
  certPath: string
  keyPath: string
  /** SNI hostname when used in a multi-cert array. */
  serverName?: string
}

export interface ListenBinding {
  host: string
  port: number
  role: ListenRole
  tls: ListenTlsOptions | ListenTlsOptions[] | null
}

/** Edge (proxy) + control (operator / acme-dns) listeners. */
export interface StackListenOptions {
  http: ListenBinding
  https: ListenBinding | null
  controlHttp: ListenBinding
  controlHttps: ListenBinding | null
}

/** @deprecated Prefer StackListenOptions — kept for call-site typing during transition. */
export type DualListenOptions = StackListenOptions

function parsePort(value: string | undefined, fallback: string): number {
  const raw = value ?? fallback
  const port = Number(raw)
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`invalid API listen port: ${raw}`)
  }
  return port
}

export function resolveTlsMaterial(): ListenTlsOptions | null {
  const config = getAcmeConfig()
  const certPath = config.api.tls_cert_fullchain?.trim()
  const keyPath = config.api.tls_cert_privkey?.trim()
  if (!certPath || !keyPath) {
    if (config.api.tls === 'cert') {
      console.warn(
        '[acmedns] api.tls is "cert" but tls_cert_fullchain / tls_cert_privkey are not set — HTTP only',
      )
    }
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

/** In-process / operator base URL — always the control plane. */
export function localApiBaseUrl(): string {
  const listen = resolveListenOptions()
  if (listen.controlHttps) {
    return formatLocalBase('https', listen.controlHttps.port)
  }
  return formatLocalBase('http', listen.controlHttp.port)
}

export function isControlBinding(binding: ListenBinding): boolean {
  return binding.role === 'control'
}

export function isEdgeBinding(binding: ListenBinding): boolean {
  return binding.role === 'edge'
}

/**
 * Always bind edge HTTP (default `:80`) and control HTTP (default `:1080`).
 * HTTPS edge (`:443`) and control (`:1443`) when TLS material is available
 * (`api.tls = "cert"` and/or proxy host PEMs — edge SNI filled later by entry).
 */
export function resolveListenOptions(): StackListenOptions {
  const config = getAcmeConfig()
  const host = process.env.NITRO_HOST || process.env.HOST || config.api.ip || '0.0.0.0'
  const envPort = process.env.NITRO_PORT || process.env.PORT
  const controlPort = parsePort(process.env.ACMEDNS_CONTROL_PORT, '1080')
  const controlTlsPort = parsePort(process.env.ACMEDNS_CONTROL_TLS_PORT, '1443')

  if (config.api.tls !== 'none' && config.api.tls !== 'cert') {
    console.warn(
      `[acmedns] api.tls "${config.api.tls}" is not supported (use "none" or "cert") — HTTP only for TLS`,
    )
  }

  const defaultTls = config.api.tls === 'cert' ? resolveTlsMaterial() : null

  // Edge HTTP stays on 80 (or NITRO_PORT/PORT). When tls=cert failed, still 80.
  const httpFallback = config.api.tls === 'cert' ? '80' : (config.api.port || '80')
  const httpPort = parsePort(envPort, httpFallback)

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

  if (controlPort === httpPort || controlPort === httpsPort) {
    throw new Error(
      `ACMEDNS_CONTROL_PORT ${controlPort} collides with edge port; pick a free control port`,
    )
  }
  if (controlTlsPort === httpPort || controlTlsPort === httpsPort || controlTlsPort === controlPort) {
    throw new Error(
      `ACMEDNS_CONTROL_TLS_PORT ${controlTlsPort} collides with another listen port`,
    )
  }

  const http: ListenBinding = { host, port: httpPort, role: 'edge', tls: null }
  const controlHttp: ListenBinding = { host, port: controlPort, role: 'control', tls: null }

  // Edge HTTPS: enabled when default TLS material exists (SNI array may be
  // expanded by entry after proxy hosts load). Control HTTPS uses default cert.
  const https: ListenBinding | null = defaultTls
    ? { host, port: httpsPort, role: 'edge', tls: defaultTls }
    : null
  const controlHttps: ListenBinding | null = defaultTls
    ? { host, port: controlTlsPort, role: 'control', tls: defaultTls }
    : null

  return { http, https, controlHttp, controlHttps }
}
