import type { CertApplyResult, CertJobQueueItem, LetsEncryptDirectoryMode } from '#shared/types/certs'
import { enqueueCertJob, startCertJob } from './certJobQueue'

export async function applyCertificates(options: {
  mode: LetsEncryptDirectoryMode
  certNames?: string[]
  force?: boolean
  renewOnly?: boolean
  source?: 'renew' | 'apply'
}): Promise<CertApplyResult[]> {
  const source = options.source ?? (options.renewOnly ? 'renew' : 'apply')

  return enqueueCertJob({
    mode: options.mode,
    source,
    certNames: options.certNames,
    force: options.force,
    renewOnly: options.renewOnly,
  })
}

/** Queue Apply without waiting for ACME (avoids proxy 504). */
export async function startApplyCertificates(options: {
  mode: LetsEncryptDirectoryMode
  certNames?: string[]
  force?: boolean
}): Promise<CertJobQueueItem> {
  return startCertJob({
    mode: options.mode,
    source: 'apply',
    certNames: options.certNames,
    force: options.force,
  })
}
