import { describe, expect, test } from 'bun:test'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { domainsPath, selectedDomainFromRoute } from '../runtime/shared/utils/domainsRoute'

function route(overrides: {
  params?: Record<string, string | string[]>
  query?: Record<string, string | string[] | undefined | null>
}): RouteLocationNormalizedLoaded {
  return {
    params: overrides.params || {},
    query: overrides.query || {},
  } as RouteLocationNormalizedLoaded
}

describe('domainsRoute', () => {
  test('domainsPath builds list and detail URLs', () => {
    expect(domainsPath()).toBe('/domains')
    expect(domainsPath('example.com')).toBe('/domains/example.com')
  })

  test('selectedDomainFromRoute prefers path param over query', () => {
    expect(selectedDomainFromRoute(route({ params: { domain: 'a.example' }, query: { d: 'b.example' } }))).toBe('a.example')
    expect(selectedDomainFromRoute(route({ query: { d: 'b.example' } }))).toBe('b.example')
    expect(selectedDomainFromRoute(route({}))).toBe('')
  })
})
