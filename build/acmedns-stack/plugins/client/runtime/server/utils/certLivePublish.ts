import type { CertLiveSnapshot, CertLiveStatusEvent, LetsEncryptDirectoryMode } from '#shared/types/certs'
import { getCertActivityEntries, getLastCertErrors } from './certActivity'
import { getCertJobQueueSnapshot, getCertJobStatus } from './certJobQueue'
import { getCertRateLimitsSync, rateLimitForCert } from './certRateLimit'
import { buildCertStatus } from './certStatus'
import { publishCertLive } from './certLiveBus'

export function buildCertLiveSnapshot(): CertLiveSnapshot {
  return {
    entries: getCertActivityEntries({ limit: 100 }),
    job: getCertJobStatus(),
    queue: getCertJobQueueSnapshot(),
    lastErrors: getLastCertErrors(),
    rateLimits: getCertRateLimitsSync(),
  }
}

export async function buildCertLiveStatus(mode: LetsEncryptDirectoryMode): Promise<CertLiveStatusEvent> {
  const lastErrors = getLastCertErrors()
  const rateLimits = getCertRateLimitsSync()
  const entries = await buildCertStatus(mode)
  return {
    mode,
    entries: entries.map((entry) => {
      const lastError = lastErrors[entry.certName]
      const rate = rateLimitForCert(rateLimits, mode, entry.certName)
      return {
        ...entry,
        lastError: lastError?.message,
        rateLimitedUntil: rate?.until,
        rateLimitDetail: rate?.detail,
      }
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
