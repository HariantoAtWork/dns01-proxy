import type { RouteLocationNormalizedLoaded } from 'vue-router'

/** Canonical path for Domains list or a selected hostname. */
export function domainsPath(domain?: string) {
  if (!domain) {
    return '/domains'
  }
  return `/domains/${encodeURIComponent(domain)}`
}

/** Resolve selection from `/domains/:domain` or legacy `/domains?d=`. */
export function selectedDomainFromRoute(route: RouteLocationNormalizedLoaded) {
  const param = route.params.domain
  if (typeof param === 'string' && param) {
    return decodeURIComponent(param)
  }
  if (Array.isArray(param) && typeof param[0] === 'string' && param[0]) {
    return decodeURIComponent(param[0])
  }
  const query = route.query.d
  return typeof query === 'string' ? query : ''
}
