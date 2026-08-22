import type {
  CertApplyResult,
  CertSettings,
  CertStatusEntry,
  DomainsParseResult,
  LetsEncryptDirectoryMode,
  TrashItem,
} from '#shared/types/certs'

export function useCerts() {
  const text = ref('')
  const parsed = ref<DomainsParseResult | null>(null)
  const statusEntries = ref<CertStatusEntry[]>([])
  const directoryMode = ref<LetsEncryptDirectoryMode>('production')
  const acmeEnabled = ref(true)
  const applyResults = ref<CertApplyResult[]>([])
  const trashItems = ref<TrashItem[]>([])
  const error = ref('')
  const pending = ref(false)

  async function loadDomains() {
    const data = await $fetch<DomainsParseResult>('/api/certs/domains')
    text.value = data.text
    parsed.value = data
    return data
  }

  async function loadSettings() {
    const data = await $fetch<CertSettings & { acmeEnabled: boolean }>('/api/certs/settings')
    directoryMode.value = data.directoryMode
    acmeEnabled.value = data.acmeEnabled
    return data
  }

  async function saveSettings(mode: LetsEncryptDirectoryMode) {
    const data = await $fetch<CertSettings>('/api/certs/settings', {
      method: 'PUT',
      body: { directoryMode: mode },
    })
    directoryMode.value = data.directoryMode
    return data
  }

  async function saveDomains() {
    pending.value = true
    error.value = ''
    try {
      const data = await $fetch<DomainsParseResult>('/api/certs/domains', {
        method: 'PUT',
        body: { text: text.value },
      })
      parsed.value = data
      if (!data.ok) {
        error.value = data.errors.map(e => `Line ${e.line}: ${e.message}`).join('\n')
      }
      return data
    }
    catch (caught: unknown) {
      const data = (caught as { data?: DomainsParseResult })?.data
      if (data?.errors) {
        parsed.value = data
        error.value = data.errors.map(e => `Line ${e.line}: ${e.message}`).join('\n')
        return data
      }
      error.value = caught instanceof Error ? caught.message : 'Save failed'
      throw caught
    }
    finally {
      pending.value = false
    }
  }

  async function validateDomains() {
    return await $fetch<DomainsParseResult>('/api/certs/domains/validate', {
      method: 'POST',
      body: { text: text.value },
    })
  }

  async function loadStatus(mode?: LetsEncryptDirectoryMode) {
    const m = mode ?? directoryMode.value
    const data = await $fetch<{ mode: LetsEncryptDirectoryMode, entries: CertStatusEntry[] }>(
      '/api/certs/status',
      { query: { mode: m } },
    )
    statusEntries.value = data.entries
    return data
  }

  async function apply(options?: { certNames?: string[], force?: boolean }) {
    pending.value = true
    error.value = ''
    try {
      const data = await $fetch<{ mode: LetsEncryptDirectoryMode, results: CertApplyResult[] }>(
        '/api/certs/apply',
        {
          method: 'POST',
          body: {
            mode: directoryMode.value,
            certNames: options?.certNames,
            force: options?.force,
          },
        },
      )
      applyResults.value = data.results
      await loadStatus()
      return data
    }
    catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Apply failed'
      throw caught
    }
    finally {
      pending.value = false
    }
  }

  async function loadTrash() {
    const data = await $fetch<{ items: TrashItem[] }>('/api/certs/trash')
    trashItems.value = data.items
    return data
  }

  async function trashCert(certName: string, fromTree: 'live' | 'staging' = 'live') {
    await $fetch(`/api/certs/trash/${encodeURIComponent(certName)}`, {
      method: 'POST',
      body: { fromTree },
    })
    await loadTrash()
    await loadStatus()
  }

  async function restoreTrash(certName: string) {
    await $fetch(`/api/certs/trash/${encodeURIComponent(certName)}/restore`, {
      method: 'POST',
    })
    await loadTrash()
    await loadStatus()
  }

  async function permanentDelete(certName: string) {
    await $fetch(`/api/certs/trash/${encodeURIComponent(certName)}`, {
      method: 'DELETE',
    })
    await loadTrash()
  }

  return {
    text,
    parsed,
    statusEntries,
    directoryMode,
    acmeEnabled,
    applyResults,
    trashItems,
    error,
    pending,
    loadDomains,
    loadSettings,
    saveSettings,
    saveDomains,
    validateDomains,
    loadStatus,
    apply,
    loadTrash,
    trashCert,
    restoreTrash,
    permanentDelete,
  }
}
