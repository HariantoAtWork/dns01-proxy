import type { AcmeDnsCredentials, ClientStorageMap, DomainEntry, StorageFileBody, StorageMutationResult } from '#shared/types/clientstorage'
import { fulldomainForAccount } from '#shared/utils/fulldomain'
import { filenameFromDisposition, triggerDownload } from '#client/utils/download'

export function useClientStorage() {
  const { data, error, status, refresh } = useFetch<ClientStorageMap>('/api/clientstorage', {
    key: 'clientstorage',
  })

  const entries = computed<DomainEntry[]>(() => {
    if (!data.value) {
      return []
    }

    return Object.entries(data.value)
      .map(([domain, details]) => ({
        domain,
        details: {
          ...details,
          fulldomain: fulldomainForAccount(details.subdomain, details.server_url, details.fulldomain),
        },
      }))
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

  async function downloadFile() {
    const response = await fetch('/api/clientstorage/file', { credentials: 'same-origin' })
    if (!response.ok) {
      let message = 'Download failed'
      try {
        const body = await response.json() as { message?: string }
        if (typeof body.message === 'string' && body.message) {
          message = body.message
        }
      }
      catch {
        // Keep the generic message when the error body is not JSON.
      }
      throw new Error(message)
    }

    const blob = await response.blob()
    triggerDownload(blob, filenameFromDisposition(response.headers.get('content-disposition'), 'clientstorage.json'))
  }

  async function uploadFile(storage: ClientStorageMap, overwrite = false) {
    const result = await $fetch<StorageMutationResult>('/api/clientstorage/file', {
      method: 'POST',
      body: { storage, overwrite } satisfies StorageFileBody,
    })

    if (!result.success) {
      throw Object.assign(new Error(result.message), { needsOverwrite: result.needsOverwrite })
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
    downloadFile,
    uploadFile,
  }
}
