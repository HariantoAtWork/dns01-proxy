export function safeRedirectPath(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '/'
  }

  const path = raw.trim()
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
    return '/'
  }

  if (path === '/login' || path.startsWith('/login?') || path.startsWith('/login#')) {
    return '/'
  }

  return path
}
