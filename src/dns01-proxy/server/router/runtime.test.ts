import { describe, expect, test } from 'bun:test'
import { buildRouterBindSpecs } from './runtime'
import { normalizeRouterSource } from '../../plugins/router/runtime/shared/utils/routerSource'
import { normalizeRouterTarget } from '../../plugins/router/runtime/shared/utils/routerTarget'

describe('buildRouterBindSpecs', () => {
  test('maps enabled source ports to enabled target host', () => {
    const target = normalizeRouterTarget({ name: 'sunshine', host: '10.0.0.9', enabled: true }, 't1')
    const source = normalizeRouterSource({
      domainNames: ['sunshine.example.com'],
      targetId: 't1',
      portMaps: [
        { protocol: 'tcp', listenPort: 47990, targetPort: 47990 },
        { protocol: 'udp', listenPort: 47998, targetPort: 47998 },
      ],
      enabled: true,
    }, 's1')
    const specs = buildRouterBindSpecs([source], [target])
    expect(specs).toHaveLength(2)
    expect(specs[0]).toMatchObject({
      key: 'tcp:47990',
      targetHost: '10.0.0.9',
      targetPort: 47990,
    })
    expect(specs[1]?.key).toBe('udp:47998')
  })

  test('skips disabled source or target', () => {
    const target = normalizeRouterTarget({ name: 'off', host: '10.0.0.1', enabled: false }, 't1')
    const source = normalizeRouterSource({
      domainNames: ['a.example.com'],
      targetId: 't1',
      portMaps: [{ protocol: 'tcp', listenPort: 9000, targetPort: 9000 }],
      enabled: true,
    }, 's1')
    expect(buildRouterBindSpecs([source], [target])).toEqual([])
  })
})
