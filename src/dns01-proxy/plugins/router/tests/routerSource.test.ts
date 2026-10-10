import { describe, expect, test } from 'bun:test'
import {
  formatPortMapsSummary,
  normalizeRouterSource,
  validateRouterSource,
} from '../runtime/shared/utils/routerSource'
import { normalizeRouterTarget } from '../runtime/shared/utils/routerTarget'
import { sunshineMoonlightPortMaps } from '../runtime/shared/utils/sunshinePreset'

describe('routerSource', () => {
  const target = normalizeRouterTarget({ name: 'sunshine', host: '10.0.0.5' }, 't1')

  test('normalizes domains and sorts port maps', () => {
    const source = normalizeRouterSource({
      domainNames: ['Sunshine.Example.com.', 'sunshine.example.com'],
      targetId: 't1',
      portMaps: [
        { protocol: 'udp', listenPort: 47998, targetPort: 47998 },
        { protocol: 'tcp', listenPort: 47989, targetPort: 47989 },
        { protocol: 'tcp', listenPort: 47989, targetPort: 1 },
      ],
      enabled: true,
    })
    expect(source.domainNames).toEqual(['sunshine.example.com'])
    expect(source.portMaps.map(m => `${m.protocol}:${m.listenPort}`)).toEqual([
      'tcp:47989',
      'udp:47998',
    ])
  })

  test('rejects reserved listen ports', () => {
    const source = normalizeRouterSource({
      domainNames: ['game.example.com'],
      targetId: 't1',
      portMaps: [{ protocol: 'tcp', listenPort: 443, targetPort: 443 }],
    })
    expect(validateRouterSource(source, [target], [])).toMatch(/reserved/i)
  })

  test('rejects port clash between enabled sources', () => {
    const a = normalizeRouterSource({
      domainNames: ['a.example.com'],
      targetId: 't1',
      portMaps: [{ protocol: 'tcp', listenPort: 47990, targetPort: 47990 }],
    }, 's1')
    const b = normalizeRouterSource({
      domainNames: ['b.example.com'],
      targetId: 't1',
      portMaps: [{ protocol: 'tcp', listenPort: 47990, targetPort: 47990 }],
    }, 's2')
    expect(validateRouterSource(b, [target], [a])).toMatch(/already used/i)
  })

  test('sunshine preset is passthrough', () => {
    const maps = sunshineMoonlightPortMaps()
    expect(maps.length).toBeGreaterThan(5)
    expect(maps.every(m => m.listenPort === m.targetPort)).toBe(true)
    expect(maps.some(m => m.protocol === 'udp')).toBe(true)
    expect(formatPortMapsSummary(maps)).toContain('TCP')
    expect(formatPortMapsSummary(maps)).toContain('UDP')
  })

  test('accepts valid sunshine source', () => {
    const source = normalizeRouterSource({
      domainNames: ['sunshine.harianto.link'],
      targetId: 't1',
      portMaps: sunshineMoonlightPortMaps(),
    })
    expect(validateRouterSource(source, [target], [])).toBeNull()
  })
})
