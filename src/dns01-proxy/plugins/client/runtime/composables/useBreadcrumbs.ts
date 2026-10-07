export type BreadcrumbItem = {
  label: string
  to?: string
}

export function useBreadcrumbs() {
  const route = useRoute()
  const { sharedMode } = useSharedMode()

  const items = computed<BreadcrumbItem[]>(() => {
    const crumbs: BreadcrumbItem[] = [{ label: 'Home', to: '/' }]
    const path = route.path

    if (path === '/') {
      return crumbs
    }

    if (path === '/domains' || path.startsWith('/domains/')) {
      crumbs.push({
        label: sharedMode.value ? 'DNS setup' : 'Domains',
        to: '/domains',
      })
      const fromParam = route.params.domain
      const domain = typeof fromParam === 'string' && fromParam
        ? decodeURIComponent(fromParam)
        : typeof route.query.d === 'string'
          ? route.query.d
          : ''
      if (domain) {
        crumbs.push({ label: domain })
      }
      return crumbs
    }

    if (path === '/help') {
      crumbs.push({ label: 'Help' })
      return crumbs
    }

    if (path === '/backup') {
      const domain = route.query.domain
      if (typeof domain === 'string' && domain) {
        crumbs.push({
          label: domain,
          to: `/domains/${encodeURIComponent(domain)}`,
        })
      }
      crumbs.push({ label: 'Backup' })
      return crumbs
    }

    if (path.startsWith('/certs')) {
      crumbs.push({ label: 'Certificates', to: '/certs' })
      if (path === '/certs/last-saved') {
        crumbs.push({ label: 'Last saved' })
      }
      else if (path === '/certs/trash') {
        crumbs.push({ label: 'Trash' })
      }
      return crumbs
    }

    if (path === '/settings') {
      crumbs.push({ label: 'Settings' })
      return crumbs
    }

    if (path === '/register') {
      crumbs.push({ label: 'Register domain' })
      return crumbs
    }

    if (path === '/login') {
      crumbs.push({ label: 'Sign in' })
      return crumbs
    }

    if (path.startsWith('/proxy')) {
      crumbs.push({ label: 'Proxy', to: '/proxy' })
      if (path === '/proxy/hosts') {
        crumbs.push({ label: 'Hosts' })
      }
      else if (path === '/proxy/access-lists') {
        crumbs.push({ label: 'Access Lists' })
      }
      else if (path === '/proxy/bearer-lists') {
        crumbs.push({ label: 'Bearer Lists' })
      }
      return crumbs
    }

    return crumbs
  })

  return { items }
}
