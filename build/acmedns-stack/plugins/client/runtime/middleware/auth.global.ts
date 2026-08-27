import { safeRedirectPath } from '#shared/utils/safeRedirect'

export default defineNuxtRouteMiddleware(async (to) => {
  const { restrictMode, authenticated, refresh } = useAuth()

  try {
    await refresh()
  }
  catch {
    // Session probe failed. Nitro still gates APIs; do not lock an open console.
  }

  const isLogin = to.path === '/login'

  if (!restrictMode.value) {
    if (isLogin) {
      return navigateTo('/')
    }
    return
  }

  if (isLogin) {
    if (authenticated.value) {
      return navigateTo(safeRedirectPath(to.query.redirect))
    }
    return
  }

  if (!authenticated.value) {
    return navigateTo({
      path: '/login',
      query: { redirect: to.fullPath },
    })
  }
})
