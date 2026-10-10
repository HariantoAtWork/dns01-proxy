import { describe, expect, test } from 'bun:test'
import {
  findDuplicateTargetName,
  normalizeRouterTarget,
  validateRouterTarget,
} from '../runtime/shared/utils/routerTarget'

describe('routerTarget', () => {
  test('normalizes name slug and host', () => {
    const target = normalizeRouterTarget({
      name: ' Sunshine Box ',
      host: '192.168.1.50.',
      enabled: true,
    })
    expect(target.name).toBe('sunshine-box')
    expect(target.host).toBe('192.168.1.50')
    expect(target.id).toBeTruthy()
  })

  test('validates required fields', () => {
    expect(validateRouterTarget(normalizeRouterTarget({ name: '', host: 'a' }))).toMatch(/name/i)
    expect(validateRouterTarget(normalizeRouterTarget({ name: 'ok', host: '' }))).toMatch(/host/i)
    expect(validateRouterTarget(normalizeRouterTarget({ name: 'ok', host: 'sunshine.local' }))).toBeNull()
  })

  test('detects duplicate names', () => {
    const existing = [normalizeRouterTarget({ name: 'sunshine', host: '10.0.0.1' }, 'a')]
    expect(findDuplicateTargetName('Sunshine', existing)?.id).toBe('a')
    expect(findDuplicateTargetName('sunshine', existing, 'a')).toBeNull()
  })
})
