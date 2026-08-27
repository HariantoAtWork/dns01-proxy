import type { IpFamily, PublicIpAddress, PublicNetworkResult } from '#shared/types/network'

const BROWSER_PROBES: Array<{ url: string, family: IpFamily }> = [
  { url: 'https://ipv4.icanhazip.com', family: 4 },
  { url: 'https://ipv6.icanhazip.com', family: 6 },
]

function looksLikeFamily(address: string, family: IpFamily) {
  if (family === 4) {
    return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(address)
  }
  return address.includes(':')
}

async function probeBrowserEcho(url: string, family: IpFamily): Promise<PublicIpAddress | null> {
  try {
    const body = await $fetch<string>(url, {
      responseType: 'text',
      timeout: 3500,
    })
    const address = String(body).trim().split(/\s+/)[0]
    if (!address || !looksLikeFamily(address, family)) {
      return null
    }
    return {
      address,
      family,
      sources: ['icanhazip'],
      origins: ['browser'],
    }
  }
  catch {
    return null
  }
}

function mergeAddresses(items: PublicIpAddress[]): PublicIpAddress[] {
  const grouped = new Map<string, PublicIpAddress>()

  for (const item of items) {
    const existing = grouped.get(item.address)
    if (!existing) {
      grouped.set(item.address, {
        address: item.address,
        family: item.family,
        sources: [...item.sources],
        origins: [...item.origins],
      })
      continue
    }

    for (const source of item.sources) {
      if (!existing.sources.includes(source)) {
        existing.sources.push(source)
      }
    }
    for (const origin of item.origins) {
      if (!existing.origins.includes(origin)) {
        existing.origins.push(origin)
      }
    }
  }

  return [...grouped.values()].sort((left, right) => {
    if (left.family !== right.family) {
      return left.family - right.family
    }
    return left.address.localeCompare(right.address)
  })
}

export function usePublicIps() {
  const forceRefresh = ref(false)
  const browser = ref<PublicIpAddress[]>([])
  const browserPending = ref(false)
  const refreshing = ref(false)

  const { data, error, status, refresh, execute } = useFetch<PublicNetworkResult>('/api/network/public', {
    key: 'public-network',
    lazy: true,
    immediate: false,
    watch: false,
    query: {
      refresh: computed(() => forceRefresh.value ? '1' : ''),
    },
  })

  const host = computed(() => data.value?.host ?? [])
  const visit = computed(() => data.value?.visit ?? null)
  const addresses = computed(() => mergeAddresses([...host.value, ...browser.value]))

  const multiplePerFamily = computed(() => {
    const v4 = addresses.value.filter(item => item.family === 4).length
    const v6 = addresses.value.filter(item => item.family === 6).length
    return v4 > 1 || v6 > 1
  })

  const ipv6OnlyInBrowser = computed(() => {
    const v6 = addresses.value.filter(item => item.family === 6)
    return v6.length > 0 && v6.every(item => !item.origins.includes('host'))
  })

  async function probeBrowser() {
    if (!import.meta.client) {
      return
    }

    browserPending.value = true
    try {
      const hits = await Promise.all(
        BROWSER_PROBES.map(probe => probeBrowserEcho(probe.url, probe.family)),
      )
      browser.value = hits.filter((hit): hit is PublicIpAddress => hit !== null)
    }
    finally {
      browserPending.value = false
    }
  }

  async function load() {
    if (addresses.value.length) {
      return
    }
    await Promise.all([execute(), probeBrowser()])
  }

  async function reload() {
    refreshing.value = true
    forceRefresh.value = true
    try {
      await Promise.all([refresh(), probeBrowser()])
    }
    finally {
      refreshing.value = false
    }
  }

  const loading = computed(() => {
    if (addresses.value.length) {
      return false
    }
    return status.value === 'pending' || browserPending.value
  })

  return {
    data,
    error,
    status,
    refresh: reload,
    load,
    host,
    visit,
    addresses,
    multiplePerFamily,
    ipv6OnlyInBrowser,
    loading,
    refreshing,
  }
}
