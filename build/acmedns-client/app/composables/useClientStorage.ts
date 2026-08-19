import type { AcmeDnsCredentials, ClientStorageMap, DomainEntry, StorageMutationResult } from '#shared/types/clientstorage'

export function useClientStorage() {
  const { data, error, status, refresh } = useFetch<ClientStorageMap>('/api/clientstorage', {
    key: 'clientstorage',
  })

  const entries = computed<DomainEntry[]>(() => {
    if (!data.value) {
      return []
    }

    return Object.entries(data.value)
      .map(([domain, details]) => ({ domain, details }))
      .sort((left, right) => left.domain.localeCompare(right.domain))
  })

  async function saveDomain(domain: string, details: AcmeDnsCredentials, overwrite = true) {
    const result = await $fetch<StorageMutationResult>('/api/clientstorage', {
      method: 'POST',
      body: { domain, data: details, overwrite },
    })

    if (!result.success) {
      throw new Error(result.message)
    }

    await refresh()
    return result
  }

  async function deleteDomain(domain: string) {
    const result = await $fetch<StorageMutationResult>(`/api/clientstorage/${encodeURIComponent(domain)}`, {
      method: 'DELETE',
    })

    if (!result.success) {
      throw new Error(result.message)
    }

    await refresh()
    return result
  }

  return {
    data,
    error,
    status,
    refresh,
    entries,
    saveDomain,
    deleteDomain,
  }
}
