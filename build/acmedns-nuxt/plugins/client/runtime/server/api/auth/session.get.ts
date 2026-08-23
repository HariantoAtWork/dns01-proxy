import type { AuthSession } from '#shared/types/auth'

export default defineEventHandler((event): AuthSession => {
  const restrictMode = isRestrictMode(event)
  return {
    restrictMode,
    authenticated: restrictMode && isAuthenticated(event),
  }
})
