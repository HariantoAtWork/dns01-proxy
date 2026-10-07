import type { CertJobQueueSnapshot, CertJobStatus } from '#shared/types/certs'

export function useCertQueueState() {
  const certJob = useState<CertJobStatus>('cert-queue-job', () => ({ running: false }))
  const certQueue = useState<CertJobQueueSnapshot>('cert-queue-snapshot', () => ({
    running: null,
    queued: [],
    cancelled: [],
  }))

  return {
    certJob,
    certQueue,
  }
}
