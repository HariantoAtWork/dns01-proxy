import { describe, expect, test } from 'bun:test'
import {
  port53ProbeFromLookup,
  port53StatusLabel,
  port53SummaryLabel,
  port53SummaryTone,
  summarizePort53Reachability,
} from '../runtime/shared/utils/port53Reachability'

/** RFC 5737 documentation addresses — not real hosts. */
const ECHO_PUBLIC_IP = '203.0.113.10'
const DELEGATED_NS_IP = '203.0.113.20'
const GLUE_PLACEHOLDER_IP = '198.51.100.1'

describe('port53ProbeFromLookup', () => {
  test('maps ok lookup to reachable probe', () => {
    const probe = port53ProbeFromLookup('ok', ECHO_PUBLIC_IP, `public ${ECHO_PUBLIC_IP}`)
    expect(probe.status).toBe('ok')
    expect(probe.message).toContain('auth zone')
    expect(probe.message).toContain('UDP')
  })

  test('maps ok TCP lookup after fallback', () => {
    const probe = port53ProbeFromLookup('ok', ECHO_PUBLIC_IP, `public ${ECHO_PUBLIC_IP}`, 'tcp')
    expect(probe.status).toBe('ok')
    expect(probe.message).toContain('TCP')
  })

  test('maps timeout to unreachable probe', () => {
    const probe = port53ProbeFromLookup('timeout', ECHO_PUBLIC_IP, `public ${ECHO_PUBLIC_IP}`)
    expect(probe.status).toBe('timeout')
  })
})

describe('summarizePort53Reachability', () => {
  const authZone = 'auth.example.test'

  test('reports ok when detected public IP answers on port 53', () => {
    const result = summarizePort53Reachability({
      authZone,
      local: port53ProbeFromLookup('timeout', '127.0.0.1', 'this container'),
      hostPublic: [port53ProbeFromLookup('ok', ECHO_PUBLIC_IP, `public ${ECHO_PUBLIC_IP}`)],
      configured: [port53ProbeFromLookup('timeout', GLUE_PLACEHOLDER_IP, `glue A ${GLUE_PLACEHOLDER_IP}`)],
      delegation: null,
    })

    expect(result.summary).toBe('ok')
  })

  test('reports ok when public probe answered via TCP fallback', () => {
    const result = summarizePort53Reachability({
      authZone,
      local: port53ProbeFromLookup('ok', '127.0.0.1', 'this container'),
      hostPublic: [port53ProbeFromLookup('ok', ECHO_PUBLIC_IP, `public ${ECHO_PUBLIC_IP}`, 'tcp')],
      configured: [],
      delegation: null,
    })

    expect(result.summary).toBe('ok')
  })

  test('reports partial (not failed) when local DNS works but public self-check times out', () => {
    const result = summarizePort53Reachability({
      authZone,
      local: port53ProbeFromLookup('ok', '127.0.0.1', 'this container'),
      hostPublic: [port53ProbeFromLookup('timeout', ECHO_PUBLIC_IP, `public ${ECHO_PUBLIC_IP}`)],
      configured: [],
      delegation: null,
    })

    expect(result.summary).toBe('partial')
    expect(result.hint).toContain('hairpin')
  })

  test('reports failed when nothing answers', () => {
    const result = summarizePort53Reachability({
      authZone,
      local: port53ProbeFromLookup('timeout', '127.0.0.1', 'this container'),
      hostPublic: [port53ProbeFromLookup('timeout', ECHO_PUBLIC_IP, `public ${ECHO_PUBLIC_IP}`)],
      configured: [],
      delegation: null,
    })

    expect(result.summary).toBe('failed')
  })

  test('reports partial when delegation answers but echo public IP times out (hairpin)', () => {
    const result = summarizePort53Reachability({
      authZone,
      local: port53ProbeFromLookup('ok', '127.0.0.1', 'this container'),
      hostPublic: [port53ProbeFromLookup('timeout', ECHO_PUBLIC_IP, `public ${ECHO_PUBLIC_IP}`)],
      configured: [],
      delegation: {
        nameservers: ['ns.auth.example.test'],
        addresses: [DELEGATED_NS_IP],
        matchesHostIp: false,
        probes: [port53ProbeFromLookup('ok', DELEGATED_NS_IP, `delegated ${DELEGATED_NS_IP}`)],
      },
    })

    expect(result.summary).toBe('partial')
    expect(result.hint).toContain('hairpin')
    expect(result.hint).toContain(DELEGATED_NS_IP)
  })

  test('reports failed when public IP answers for the wrong zone', () => {
    const result = summarizePort53Reachability({
      authZone,
      local: port53ProbeFromLookup('ok', '127.0.0.1', 'this container'),
      hostPublic: [port53ProbeFromLookup('nxdomain', ECHO_PUBLIC_IP, `public ${ECHO_PUBLIC_IP}`)],
      configured: [],
      delegation: null,
    })

    expect(result.summary).toBe('failed')
    expect(result.hint).toContain('not with this auth zone')
  })
})

describe('port53 labels', () => {
  test('formats status and summary labels', () => {
    expect(port53StatusLabel('ok')).toBe('Reachable')
    expect(port53SummaryLabel('ok')).toBe('Port 53 reachable for DNS-01')
    expect(port53SummaryLabel('partial')).toBe('Port 53 unconfirmed from this host')
    expect(port53SummaryLabel('failed')).toBe('Port 53 not reachable for DNS-01')
  })

  test('maps summary to traffic-light tone', () => {
    expect(port53SummaryTone('ok')).toBe('ok')
    expect(port53SummaryTone('partial')).toBe('warn')
    expect(port53SummaryTone('failed')).toBe('bad')
    expect(port53SummaryTone('unknown')).toBe('muted')
  })
})
