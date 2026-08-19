import { safeRedirectPath } from '#shared/utils/safeRedirect'

function isPublicPath(path: string) {
  if (path.startsWith('/_') || path.startsWith('/__nuxt')) {
    return true
  }
  if (path === '/favicon.ico' || path === '/login') {
    return true
  }
  if (path.startsWith('/api/auth/')) {
    return true
  }
  if (!path.startsWith('/api/') && /\.[a-z0-9]+$/i.test(path)) {
    return true
  }
  return false
}

export default defineEventHandler((event) => {
  if (!isRestrictMode(event)) {
    return
  }

  const url = getRequestURL(event)
  const path = url.pathname

  if (isPublicPath(path)) {
    return
  }

  if (isAuthenticated(event)) {
    return
  }

  if (path.startsWith('/api/')) {
    requireAdministrator(event)
    return
  }

  const redirect = safeRedirectPath(`${path}${url.search}`)
  const target = redirect === '/'
    ? '/login'
    : `/login?redirect=${encodeURIComponent(redirect)}`

  return sendRedirect(event, target, 302)
})
