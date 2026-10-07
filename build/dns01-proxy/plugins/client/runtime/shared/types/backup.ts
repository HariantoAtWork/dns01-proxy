import type { AcmeDnsCredentials } from './clientstorage'

export type BackupKind = 'full' | 'domain'

export interface BackupListItem {
  filename: string
  kind: BackupKind
  createdAt: string
  size: number
  domain?: string
}

export interface BackupListResponse {
  directory: string
  storagePath: string
  items: BackupListItem[]
}

export interface BackupCreateBody {
  kind: BackupKind
  domain?: string
}

export interface BackupFileBody {
  file: string
  overwrite?: boolean
}

export interface BackupMutationResult {
  success: boolean
  message: string
  filename?: string
  needsOverwrite?: boolean
}

export interface DomainBackupPayload {
  kind: 'domain'
  createdAt: string
  domain: string
  credentials: AcmeDnsCredentials
}
