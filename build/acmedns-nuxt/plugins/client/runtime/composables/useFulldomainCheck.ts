import type { AcmeDnsCredentials } from '#shared/types/clientstorage'
import type { DnsTxtExistenceResult } from '#shared/utils/dnsMatch'
import { hostnameFromHttpUrl } from '#shared/utils/fulldomain'

export type FulldomainCheckStatus = 'idle' | 'running' | 'ok' | 'error'

function stripDot(value: string) {
  return value.replace(/\.$/, '').toLowerCase()
}

/** Fulldomain should be <subdomain>.<host from server_url> when server_url is a public DNS name. */
export function serverUrlMatchesFulldomain(serverUrl: string, fulldomain: string) {
  const host = hostnameFromHttpUrl(serverUrl)
  const full = stripDot(fulldomain)
  if (!host || !full || !host.includes('.')) {
    return true
  }
  return full === host || full.endsWith(`.${host}`)
}

export function useFulldomainCheck() {
  const status = ref<FulldomainCheckStatus>('idle')
  const message = ref('')
  const pending = ref(false)

  function reset() {
    status.value = 'idle'
    message.value = ''
    pending.value = false
  }

  async function run(details: AcmeDnsCredentials) {
    pending.value = true
    status.value = 'running'
    message.value = 'Checking public resolvers for the fulldomain…'

    try {
      if (!serverUrlMatchesFulldomain(details.server_url, details.fulldomain)) {
        const host = hostnameFromHttpUrl(details.server_url)
        status.value = 'error'
        message.value = (
          `server_url host (${host || 'invalid'}) does not match fulldomain `
          + `${details.fulldomain}. Update server_url to your acme-dns API `
          + `(e.g. https://auth.uti.email), not auth.acme-dns.io, then re-register if needed.`
        )
        return
      }

      const result = await $fetch<DnsTxtExistenceResult>('/api/dns/txt-check', {
        method: 'POST',
        body: { name: details.fulldomain },
      })

      if (result.status === 'nxdomain') {
        status.value = 'error'
        message.value = (
          `NXDOMAIN for ${details.fulldomain}. That UUID is not on your acme-dns server. `
          + 'Re-register against your server URL and update the Cloudflare CNAME to the new fulldomain.'
        )
        return
      }

      if (result.status === 'error') {
        status.value = 'error'
        message.value = result.message
        return
      }

      status.value = 'ok'
      message.value = result.message
    }
    catch (error) {
      status.value = 'error'
      message.value = error instanceof Error ? error.message : 'Fulldomain check failed'
    }
    finally {
      pending.value = false
    }
  }

  return {
    status,
    message,
    pending,
    run,
    reset,
  }
}
