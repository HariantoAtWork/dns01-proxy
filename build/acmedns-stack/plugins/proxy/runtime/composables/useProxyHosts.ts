import type { ProxyHost, ProxyHostInput } from '#proxy-shared/types/proxyHost'

export function useProxyHosts() {
  const hosts = ref<ProxyHost[]>([])
  const certNames = ref<string[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function loadHosts() {
    pending.value = true
    error.value = null
    try {
      const data = await $fetch<{ hosts: ProxyHost[] }>('/api/proxy/hosts')
      hosts.value = data.hosts
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load proxy hosts'
      throw err
    }
    finally {
      pending.value = false
    }
  }

  async function loadCertNames() {
    try {
      const data = await $fetch<{ entries: Array<{ certName: string }> }>('/api/certs/status')
      certNames.value = [...new Set(data.entries.map(entry => entry.certName).filter(Boolean))].sort()
    }
    catch {
      certNames.value = []
    }
  }

  async function saveHost(input: ProxyHostInput) {
    if (input.id) {
      const data = await $fetch<{ host: ProxyHost }>(`/api/proxy/hosts/${input.id}`, {
        method: 'PUT',
        body: input,
      })
      const index = hosts.value.findIndex(host => host.id === data.host.id)
      if (index >= 0) {
        hosts.value[index] = data.host
      }
      else {
        hosts.value.push(data.host)
      }
      return data.host
    }
    const data = await $fetch<{ host: ProxyHost }>('/api/proxy/hosts', {
      method: 'POST',
      body: input,
    })
    hosts.value.push(data.host)
    return data.host
  }

  async function removeHost(id: string) {
    await $fetch(`/api/proxy/hosts/${id}`, { method: 'DELETE' })
    hosts.value = hosts.value.filter(host => host.id !== id)
  }

  async function exportNginx(id: string) {
    return $fetch<{ hostId: string, snippet: string }>(`/api/proxy/hosts/${id}/nginx`)
  }

  return {
    hosts,
    certNames,
    pending,
    error,
    loadHosts,
    loadCertNames,
    saveHost,
    removeHost,
    exportNginx,
  }
}
