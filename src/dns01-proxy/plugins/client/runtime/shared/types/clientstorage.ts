export interface AcmeDnsCredentials {
  fulldomain: string
  subdomain: string
  username: string
  password: string
  server_url: string
  allowfrom?: string[]
}

export type ClientStorageMap = Record<string, AcmeDnsCredentials>

export interface DomainEntry {
  domain: string
  details: AcmeDnsCredentials
}

export interface StorageWriteBody {
  domain: string
  data: AcmeDnsCredentials
  overwrite?: boolean
}

export interface StorageMutationResult {
  success: boolean
  message: string
  needsOverwrite?: boolean
}

export interface StorageFileBody {
  storage: ClientStorageMap
  overwrite?: boolean
}

export interface DnsRecordGroup {
  name: string
  data: string[]
}

/** How the resolver treated an empty answer set. */
export type DnsLookupKind = 'ok' | 'nxdomain' | 'nodata' | 'timeout'

export interface DnsQueryResult {
  success: boolean
  data?: DnsRecordGroup[]
  message?: string
  /** Present when success is true; `nxdomain` means the name does not exist. */
  lookup?: DnsLookupKind
}
