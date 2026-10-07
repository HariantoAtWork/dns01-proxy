import { isWildcardDomainName } from '../../../../../shared/utils/proxyHost'
import { getProxyHost } from '../../../../utils/proxyHostsFile'
import { probeProxyRemoteHealth, type ProxyRemoteHealthProbe } from '../../../../utils/proxyHostHealth'

function remoteUrl(certificateName: string | null, domain: string): string {
  const scheme = certificateName ? 'https' : 'http'
  return `${scheme}://${domain}`
}

/** One domain at a time — process-wide remote queue already serializes; avoid API-level storms. */
async function probeDomains(
  domains: string[],
  certificateName: string | null,
): Promise<Record<string, ProxyRemoteHealthProbe>> {
  const result: Record<string, ProxyRemoteHealthProbe> = {}
  for (const name of domains) {
    result[name] = await probeProxyRemoteHealth(remoteUrl(certificateName, name))
  }
  return result
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Host id is required' })
  }
  const host = await getProxyHost(id)
  if (!host) {
    throw createError({ statusCode: 404, statusMessage: 'Proxy host not found' })
  }

  const exactDomains = host.domainNames.filter(name => !isWildcardDomainName(name))

  if (!host.enabled) {
    const domains: Record<string, ProxyRemoteHealthProbe> = {}
    for (const name of exactDomains) {
      domains[name] = {
        online: false,
        latencyMs: 0,
        target: remoteUrl(host.certificateName, name),
        error: 'host disabled',
      }
    }
    return { domains }
  }

  const domains = await probeDomains(exactDomains, host.certificateName)
  return { domains }
})
