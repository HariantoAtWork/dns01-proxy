/**
 * Normalise optional bearer path prefixes from JSON / UI text.
 * Empty → host-wide bearer (legacy). Non-empty → gate only matching paths.
 */
export function normalizeBearerPaths(raw: unknown): string[] {
  const items: string[] = []
  if (Array.isArray(raw)) {
    for (const item of raw) {
      items.push(String(item ?? ''))
    }
  }
  else if (typeof raw === 'string') {
    for (const part of raw.split(/[\n,]+/)) {
      items.push(part)
    }
  }

  const out: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    let path = item.trim()
    if (!path) continue
    if (!path.startsWith('/')) {
      path = `/${path}`
    }
    // Drop trailing slash except root (root alone would gate everything).
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1)
    }
    if (path === '/') {
      continue
    }
    if (seen.has(path)) continue
    seen.add(path)
    out.push(path)
  }
  return out
}

/**
 * Whether this pathname must present a valid bearer when a list is bound.
 * Empty `bearerPaths` → all paths (caller may still exempt GET /).
 */
export function pathnameRequiresBearer(
  pathname: string,
  bearerPaths: string[] | null | undefined,
): boolean {
  const prefixes = Array.isArray(bearerPaths) ? bearerPaths : []
  if (prefixes.length === 0) {
    return true
  }
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  for (const prefix of prefixes) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return true
    }
  }
  return false
}
