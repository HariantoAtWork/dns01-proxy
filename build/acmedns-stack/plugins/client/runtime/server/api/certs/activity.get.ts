import type { CertActivityResponse } from '#shared/types/certs'
import { getCertActivityEntries, getLastCertErrors } from '../../utils/certActivity'
import { getCertJobQueueSnapshot, getCertJobStatus } from '../../utils/certJobQueue'
import { getCertRateLimits } from '../../utils/certRateLimit'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const sinceId = Number.parseInt(String(query.sinceId ?? '0'), 10)
  const limit = Number.parseInt(String(query.limit ?? '100'), 10)

  const response: CertActivityResponse = {
    entries: getCertActivityEntries({
      sinceId: Number.isFinite(sinceId) && sinceId > 0 ? sinceId : undefined,
      limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 100,
    }),
    job: getCertJobStatus(),
    queue: getCertJobQueueSnapshot(),
    lastErrors: getLastCertErrors(),
    rateLimits: await getCertRateLimits(),
  }

  return response
})
