export type ForwardScheme = 'http' | 'https'

export interface ProxyLocation {
  path: string
  forwardScheme: ForwardScheme
  forwardHost: string
  forwardPort: number
  advancedConfig?: string
}

export interface ProxyHost {
  id: string
  domainNames: string[]
  forwardScheme: ForwardScheme
  forwardHost: string
  forwardPort: number
  cachingEnabled: boolean
  blockExploits: boolean
  allowWebsocketUpgrade: boolean
  accessListId?: string | null
  locations: ProxyLocation[]
  certificateName?: string | null
  sslForced: boolean
  http2Support: boolean
  hstsEnabled: boolean
  hstsSubdomains: boolean
  trustForwardedProto: boolean
  advancedConfig: string
  enabled: boolean
}

export interface ProxyHostsFile {
  version: 1
  hosts: ProxyHost[]
}

export type ProxyHostInput = Omit<ProxyHost, 'id'> & { id?: string }
