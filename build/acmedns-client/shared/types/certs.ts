export type LetsEncryptDirectoryMode = 'production' | 'staging'

export interface DomainsLineError {
  line: number
  message: string
}

export interface ParsedDomainsLine {
  line: number
  names: string[]
  certName: string
  expanded: string[]
  raw: string
}

export interface DomainsParseResult {
  ok: boolean
  text: string
  lines: ParsedDomainsLine[]
  errors: DomainsLineError[]
}

export interface CertSettings {
  directoryMode: LetsEncryptDirectoryMode
}

export type CertLineStatus = 'ok' | 'missing' | 'drift' | 'orphan' | 'error'

export interface CertStatusEntry {
  certName: string
  names: string[]
  expanded: string[]
  status: CertLineStatus
  notAfter?: string
  sansOnDisk?: string[]
  tree: 'live' | 'staging' | 'trash' | 'none'
  lastError?: string
  inDomainsFile: boolean
}

export interface CertApplyResult {
  certName: string
  ok: boolean
  message: string
  notAfter?: string
}

export interface TrashItem {
  certName: string
  trashedAt: string
  fromTree: 'live' | 'staging'
  notAfter?: string
}
