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
  /** When set, clients must send Authorization: Bearer matching this key. */
  bearerKeyId?: string | null
  locations: ProxyLocation[]
  certificateName?: string | null
  sslForced: boolean
  http2Support: boolean
  hstsEnabled: boolean
  hstsSubdomains: boolean
  trustForwardedProto: boolean
  enabled: boolean
}

export interface ProxyHostsFile {
  version: 1
  hosts: ProxyHost[]
}

export type ProxyHostInput = Omit<ProxyHost, 'id'> & { id?: string }
