export type BreadcrumbItem = {
  label: string
  to?: string
}

export function useBreadcrumbs() {
  const route = useRoute()

  const items = computed<BreadcrumbItem[]>(() => {
    const crumbs: BreadcrumbItem[] = [{ label: 'Home', to: '/' }]
    const path = route.path

    if (path === '/') {
      const domain = route.query.d
      if (typeof domain === 'string' && domain) {
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
          to: `/?d=${encodeURIComponent(domain)}`,
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

    if (path === '/register') {
      crumbs.push({ label: 'Register domain' })
      return crumbs
    }

    if (path === '/login') {
      crumbs.push({ label: 'Sign in' })
      return crumbs
    }

    return crumbs
  })

  return { items }
}
