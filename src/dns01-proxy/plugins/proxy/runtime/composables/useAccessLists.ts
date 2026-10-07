import type {
  AccessDenyEntry,
  AccessListInput,
  AccessListPublic,
  ProxySettings,
} from '#proxy-shared/types/accessList'

export function useAccessLists() {
  const lists = ref<AccessListPublic[]>([])
  const settings = ref<ProxySettings>({ trustForwardedClientIp: false })
  const denies = ref<AccessDenyEntry[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function loadLists() {
    pending.value = true
    error.value = null
    try {
      const data = await $fetch<{ lists: AccessListPublic[] }>('/api/proxy/access-lists')
      lists.value = data.lists
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load access lists'
      throw err
    }
    finally {
      pending.value = false
    }
  }

  async function loadSettings() {
    const data = await $fetch<{ settings: ProxySettings }>('/api/proxy/settings')
    settings.value = data.settings
  }

  async function saveSettings(patch: Partial<ProxySettings>) {
    const data = await $fetch<{ settings: ProxySettings }>('/api/proxy/settings', {
      method: 'PUT',
      body: patch,
    })
    settings.value = data.settings
    return data.settings
  }

  async function loadDenies() {
    try {
      const data = await $fetch<{ denies: AccessDenyEntry[] }>('/api/proxy/access-denies')
      denies.value = data.denies
    }
    catch {
      denies.value = []
    }
  }

  async function fetchClientIp() {
    return $fetch<{ address: string | null, via: string | null }>('/api/proxy/client-ip')
  }

  async function saveList(input: AccessListInput) {
    if (input.id) {
      const data = await $fetch<{ list: AccessListPublic }>(`/api/proxy/access-lists/${input.id}`, {
        method: 'PUT',
        body: input,
      })
      const index = lists.value.findIndex(list => list.id === data.list.id)
      if (index >= 0) {
        lists.value[index] = data.list
      }
      else {
        lists.value.push(data.list)
      }
      return data.list
    }
    const data = await $fetch<{ list: AccessListPublic }>('/api/proxy/access-lists', {
      method: 'POST',
      body: input,
    })
    lists.value.push(data.list)
    return data.list
  }

  async function removeList(id: string) {
    await $fetch(`/api/proxy/access-lists/${id}`, { method: 'DELETE' })
    lists.value = lists.value.filter(list => list.id !== id)
  }

  return {
    lists,
    settings,
    denies,
    pending,
    error,
    loadLists,
    loadSettings,
    saveSettings,
    loadDenies,
    fetchClientIp,
    saveList,
    removeList,
  }
}
