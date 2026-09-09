import type { ProxyHost, ProxyHostInput } from '#proxy-shared/types/proxyHost'
import type { ProxyCertCandidate } from '#proxy-shared/utils/proxyCertMatch'

export type ProxyHostHealth = {
  online: boolean
  latencyMs?: number
  status?: number
  target?: string
}

type CertStatusApiEntry = {
  certName: string
  sansOnDisk?: string[]
  liveOnDisk?: boolean
  notAfter?: string
  status?: string
  tree?: string
}

function uniqueSans(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim().toLowerCase().replace(/\.$/, '')).filter(Boolean))]
}

/**
 * Only certificates with live PEMs and leaf SANs on disk participate in matching.
 * domains.txt names/expanded are ignored — matching is from `/live/<name>/fullchain.pem`.
 */
function toCandidate(entry: CertStatusApiEntry): ProxyCertCandidate | null {
  const certName = entry.certName?.trim()
  if (!certName) {
    return null
  }
  if (entry.liveOnDisk !== true) {
    return null
  }
  const sans = uniqueSans(Array.isArray(entry.sansOnDisk) ? entry.sansOnDisk : [])
  if (!sans.length) {
    return null
  }
  return {
    certName,
    sans,
    liveOnDisk: true,
    notAfter: entry.notAfter,
    status: entry.status,
  }
}

export function useProxyHosts() {
  const hosts = ref<ProxyHost[]>([])
  const certEntries = ref<ProxyCertCandidate[]>([])
  const healthById = ref<Record<string, ProxyHostHealth>>({})
  const pending = ref(false)
  const error = ref<string | null>(null)

  const certNames = computed(() =>
    [...new Set(certEntries.value.map(entry => entry.certName))].sort(),
  )

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
      const data = await $fetch<{ entries: CertStatusApiEntry[] }>('/api/certs/status')
      const byName = new Map<string, ProxyCertCandidate>()
      for (const entry of data.entries) {
        const candidate = toCandidate(entry)
        if (!candidate) {
          continue
        }
        const prev = byName.get(candidate.certName)
        if (!prev || candidate.sans.length > prev.sans.length) {
          byName.set(candidate.certName, candidate)
        }
      }
      certEntries.value = [...byName.values()]
    }
    catch {
      certEntries.value = []
    }
  }

  async function loadHealth(id: string) {
    try {
      const data = await $fetch<ProxyHostHealth>(`/api/proxy/hosts/${id}/health`)
      healthById.value = { ...healthById.value, [id]: data }
      return data
    }
    catch {
      const fallback: ProxyHostHealth = { online: false }
      healthById.value = { ...healthById.value, [id]: fallback }
      return fallback
    }
  }

  async function loadAllHealth() {
    await Promise.all(hosts.value.map(host => loadHealth(host.id)))
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
      void loadHealth(data.host.id)
      return data.host
    }
    const data = await $fetch<{ host: ProxyHost }>('/api/proxy/hosts', {
      method: 'POST',
      body: input,
    })
    hosts.value.push(data.host)
    void loadHealth(data.host.id)
    return data.host
  }

  async function removeHost(id: string) {
    await $fetch(`/api/proxy/hosts/${id}`, { method: 'DELETE' })
    hosts.value = hosts.value.filter(host => host.id !== id)
    const next = { ...healthById.value }
    delete next[id]
    healthById.value = next
  }

  return {
    hosts,
    certEntries,
    certNames,
    healthById,
    pending,
    error,
    loadHosts,
    loadCertNames,
    loadHealth,
    loadAllHealth,
    saveHost,
    removeHost,
  }
}
