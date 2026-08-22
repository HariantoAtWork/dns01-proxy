import type { CertLiveSnapshot, CertLiveStatusEvent, LetsEncryptDirectoryMode } from '#shared/types/certs'
import { getCertActivityEntries, getLastCertErrors } from './certActivity'
import { getCertJobQueueSnapshot, getCertJobStatus } from './certJobQueue'
import { buildCertStatus } from './certStatus'
import { publishCertLive } from './certLiveBus'

export function buildCertLiveSnapshot(): CertLiveSnapshot {
  return {
    entries: getCertActivityEntries({ limit: 100 }),
    job: getCertJobStatus(),
    queue: getCertJobQueueSnapshot(),
    lastErrors: getLastCertErrors(),
  }
}

export async function buildCertLiveStatus(mode: LetsEncryptDirectoryMode): Promise<CertLiveStatusEvent> {
  const lastErrors = getLastCertErrors()
  const entries = await buildCertStatus(mode)
  return {
    mode,
    entries: entries.map((entry) => {
      const lastError = lastErrors[entry.certName]
      return lastError ? { ...entry, lastError: lastError.message } : entry
    }),
  }
}

export function publishCertLiveQueue() {
  publishCertLive({
    type: 'queue',
    data: {
      job: getCertJobStatus(),
      queue: getCertJobQueueSnapshot(),
    },
  })
}

export async function publishCertLiveStatus(mode: LetsEncryptDirectoryMode) {
  publishCertLive({
    type: 'status',
    data: await buildCertLiveStatus(mode),
  })
}
