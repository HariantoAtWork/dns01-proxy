import type { AuthLoginResult, AuthSession } from '#shared/types/auth'

const emptySession: AuthSession = {
  restrictMode: false,
  authenticated: false,
}

export function useAuth() {
  const session = useState<AuthSession>('auth-session', () => ({ ...emptySession }))
  const config = useRuntimeConfig()

  const restrictMode = computed(() => session.value.restrictMode || Boolean(config.public.restrictMode))
  const authenticated = computed(() => session.value.authenticated)

  async function refresh() {
    const fetcher = import.meta.server ? useRequestFetch() : $fetch
    session.value = await fetcher<AuthSession>('/api/auth/session')
    return session.value
  }

  async function login(username: string, password: string) {
    await $fetch<AuthLoginResult>('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    })
    await refresh()
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    session.value = { restrictMode: session.value.restrictMode, authenticated: false }
    await navigateTo('/login')
  }

  return {
    session: readonly(session),
    restrictMode,
    authenticated,
    refresh,
    login,
    logout,
  }
}
