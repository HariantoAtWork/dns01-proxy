import type {
  DomainsDnsCheck,
  DomainsParseResult,
} from '#shared/types/certs'

export function useCertDomains(deps: {
  pending: Ref<boolean>
  error: Ref<string>
}) {
  const { pending, error } = deps
  const text = ref('')
  const parsed = ref<DomainsParseResult | null>(null)

  async function loadDomains() {
    const data = await $fetch<DomainsParseResult>('/api/certs/domains')
    text.value = data.text
    parsed.value = data
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

  async function recheckDomainsDns() {
    const data = await $fetch<{ dnsChecks: DomainsDnsCheck[] }>('/api/certs/domains/dns-check', {
      method: 'POST',
      body: { text: text.value },
    })
    if (parsed.value) {
      parsed.value = { ...parsed.value, dnsChecks: data.dnsChecks }
    }
    return data.dnsChecks
  }

  return {
    text,
    parsed,
    loadDomains,
    saveDomains,
    validateDomains,
    recheckDomainsDns,
  }
}
