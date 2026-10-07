const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/

export function hostnameFromHttpUrl(serverUrl: string) {
  try {
    return new URL(serverUrl.trim()).hostname.replace(/\.$/, '').toLowerCase()
  }
  catch {
    return ''
  }
}

function isPublicDnsHost(host: string) {
  if (!host.includes('.') || IPV4_PATTERN.test(host)) {
    return false
  }

  return !host.startsWith('[')
}

export function fulldomainForAccount(subdomain: string, serverUrl: string, reported: string) {
  const host = hostnameFromHttpUrl(serverUrl)
  const fallback = reported.replace(/\.$/, '')
  const sub = subdomain.trim().replace(/\.$/, '')

  if (!sub || !isPublicDnsHost(host)) {
    return fallback
  }

  return `${sub}.${host}`
}
