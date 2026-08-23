import type {
  BackupCreateBody,
  BackupListResponse,
  BackupMutationResult,
} from '#shared/types/backup'

export function useBackups() {
  const { data, error, status, refresh } = useFetch<BackupListResponse>('/api/backups', {
    key: 'backups',
  })

  const items = computed(() => data.value?.items ?? [])
  const directory = computed(() => data.value?.directory ?? '')
  const storagePath = computed(() => data.value?.storagePath ?? '')

  async function mutate(request: () => Promise<BackupMutationResult>) {
    const result = await request()
    if (!result.success) {
      throw Object.assign(new Error(result.message), { needsOverwrite: result.needsOverwrite })
    }
    await refresh()
    return result
  }

  async function createBackup(body: BackupCreateBody) {
    return mutate(() => $fetch<BackupMutationResult>('/api/backups', {
      method: 'POST',
      body,
    }))
  }

  async function restoreBackup(file: string, overwrite = false) {
    const result = await $fetch<BackupMutationResult>('/api/backups/restore', {
      method: 'POST',
      body: { file, overwrite },
    })

    if (!result.success) {
      throw Object.assign(new Error(result.message), { needsOverwrite: result.needsOverwrite })
    }

    await refresh()
    await refreshNuxtData('clientstorage')
    return result
  }

  async function deleteBackup(file: string) {
    return mutate(() => $fetch<BackupMutationResult>('/api/backups', {
      method: 'DELETE',
      query: { file },
    }))
  }

  return {
    data,
    items,
    directory,
    storagePath,
    error,
    status,
    refresh,
    createBackup,
    restoreBackup,
    deleteBackup,
  }
}
