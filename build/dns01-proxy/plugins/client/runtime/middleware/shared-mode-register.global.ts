import { until } from '@vueuse/core'

/** Redirect /register when shared (tiny) mode — registration is not used. */
export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path !== '/register') {
    return
  }

  const { sharedMode, status } = useSharedMode()

  if (status.value === 'pending') {
    await until(status).not.toBe('pending')
  }

  if (sharedMode.value) {
    return navigateTo('/domains', { replace: true })
  }
})
