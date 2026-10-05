import { useCertActivityStatus } from './useCertActivityStatus'
import { useCertDisk } from './useCertDisk'
import { useCertDomains } from './useCertDomains'

export function useCerts() {
  const error = ref('')
  const pending = ref(false)

  const activity = useCertActivityStatus({ pending, error })
  const domains = useCertDomains({ pending, error })
  const disk = useCertDisk({ loadStatus: activity.loadStatus })

  return {
    ...domains,
    ...activity,
    ...disk,
    error,
    pending,
  }
}
