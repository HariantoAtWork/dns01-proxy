import { isWildcardDomainName } from '../../../../../shared/utils/proxyHost'
import { getProxyHost } from '../../../../utils/proxyHostsFile'
import { probeProxyRemoteHealth, type ProxyRemoteHealthProbe } from '../../../../utils/proxyHostHealth'

function remoteUrl(certificateName: string | null, domain: string): string {
  const scheme = certificateName ? 'https' : 'http'
  return `${scheme}://${domain}`
}

async function probeDomains(
  domains: string[],
  certificateName: string | null,
  concurrency = 4,
): Promise<Record<string, ProxyRemoteHealthProbe>> {
  const result: Record<string, ProxyRemoteHealthProbe> = {}
  for (let i = 0; i < domains.length; i += concurrency) {
    const batch = domains.slice(i, i + concurrency)
    const probed = await Promise.all(
      batch.map(async (name) => {
        const probe = await probeProxyRemoteHealth(remoteUrl(certificateName, name))
        return [name, probe] as const
      }),
    )
    for (const [name, probe] of probed) {
      result[name] = probe
    }
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
