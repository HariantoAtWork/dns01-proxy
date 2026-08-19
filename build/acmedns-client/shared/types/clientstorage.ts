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

export interface DnsQueryResult {
  success: boolean
  data?: DnsRecordGroup[]
  message?: string
}
