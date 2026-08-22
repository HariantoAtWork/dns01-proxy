import type { CertApplyResult, LetsEncryptDirectoryMode } from '#shared/types/certs'
import { enqueueCertJob } from './certJobQueue'

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
