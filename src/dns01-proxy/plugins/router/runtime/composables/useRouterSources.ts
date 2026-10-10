import type { RouterSource, RouterSourceInput } from '#router-shared/types/routerSource'

export type RouterSourceHealth = {
  online: boolean
  ports: Array<{
    protocol: 'tcp' | 'udp'
    listenPort: number
    targetPort: number
    bound: boolean
    online?: boolean
    latencyMs?: number
    error?: string
  }>
}

export function useRouterSources() {
  const sources = ref<RouterSource[]>([])
  const healthById = ref<Record<string, RouterSourceHealth>>({})
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function loadSources() {
    pending.value = true
    error.value = null
    try {
      const data = await $fetch<{ sources: RouterSource[] }>('/api/router/sources')
      sources.value = data.sources
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load router sources'
      throw err
    }
    finally {
      pending.value = false
    }
  }

  async function loadHealth(id: string) {
    try {
      const data = await $fetch<RouterSourceHealth>(`/api/router/sources/${id}/health`)
      healthById.value = { ...healthById.value, [id]: data }
      return data
    }
    catch {
      const fallback: RouterSourceHealth = { online: false, ports: [] }
      healthById.value = { ...healthById.value, [id]: fallback }
      return fallback
    }
  }

  async function loadAllHealth() {
    for (const source of sources.value) {
      await loadHealth(source.id)
    }
  }

  async function saveSource(input: RouterSourceInput) {
    if (input.id) {
      const data = await $fetch<{ source: RouterSource }>(`/api/router/sources/${input.id}`, {
        method: 'PUT',
        body: input,
      })
      const index = sources.value.findIndex(source => source.id === data.source.id)
      if (index >= 0) {
        sources.value[index] = data.source
      }
      else {
        sources.value.push(data.source)
      }
      void loadHealth(data.source.id)
      return data.source
    }
    const data = await $fetch<{ source: RouterSource }>('/api/router/sources', {
      method: 'POST',
      body: input,
    })
    sources.value.push(data.source)
    void loadHealth(data.source.id)
    return data.source
  }

  async function removeSource(id: string) {
    await $fetch(`/api/router/sources/${id}`, { method: 'DELETE' })
    sources.value = sources.value.filter(source => source.id !== id)
    const next = { ...healthById.value }
    delete next[id]
    healthById.value = next
  }

  return {
    sources,
    healthById,
    pending,
    error,
    loadSources,
    loadHealth,
    loadAllHealth,
    saveSource,
    removeSource,
  }
}
