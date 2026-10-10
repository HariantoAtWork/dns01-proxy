export type ForwardScheme = 'http' | 'https'

export interface ProxyLocation {
  path: string
  forwardScheme: ForwardScheme
  forwardHost: string
  forwardPort: number
}

export interface ProxyHost {
  id: string
  domainNames: string[]
  forwardScheme: ForwardScheme
  forwardHost: string
  forwardPort: number
  allowWebsocketUpgrade: boolean
  accessListId?: string | null
  /** When set, clients must send Authorization: Bearer matching any key in this list. */
  bearerListId?: string | null
  /**
   * Path prefixes that require the bearer list (e.g. `/tunnel`).
   * Empty / omitted → require bearer on all paths except unauthenticated GET `/`
   * (live status). Use this so fetch paths like `/t/:id` stay public while
   * register stays gated.
   */
  bearerPaths?: string[]
  /**
   * @deprecated Prefer bearerListId. Still read for older proxy-hosts.json rows.
   */
  bearerKeyId?: string | null
  locations: ProxyLocation[]
  certificateName?: string | null
  sslForced: boolean
  http2Support: boolean
  hstsEnabled: boolean
  hstsSubdomains: boolean
  trustForwardedProto: boolean
  /**
   * Per-request Bun idle timeout override (seconds) via `server.timeout(req, …)`.
   * `null`/omitted → inherit edge `idleTimeout`; `0` disables (streaming-safe).
   */
  idleTimeout?: number | null
  enabled: boolean
}

export interface ProxyHostsFile {
  version: 1
  hosts: ProxyHost[]
}

export type ProxyHostInput = Omit<ProxyHost, 'id'> & { id?: string }
