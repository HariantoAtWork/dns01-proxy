import type { AppSettingsResponse } from '#shared/types/appSettings'
import { sharedCnameTarget } from '#shared/utils/tinyModeDns'

export function useSharedMode() {
  const { data, status, refresh } = useFetch<AppSettingsResponse>('/api/settings', {
    key: 'app-settings-shared-mode',
  })

  const sharedMode = computed(() => Boolean(data.value?.api?.shared_mode))
  const authZone = computed(() => data.value?.general?.domain?.replace(/\.$/, '') || '')
  const cnameTarget = computed(() => (authZone.value ? sharedCnameTarget(authZone.value) : ''))

  return {
    settings: data,
    status,
    refresh,
    sharedMode,
    authZone,
    cnameTarget,
  }
}
