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

  test('reports failed when public IP exists but port 53 does not answer', () => {
    const result = summarizePort53Reachability({
      authZone,
      local: port53ProbeFromLookup('ok', '127.0.0.1', 'this container'),
      hostPublic: [port53ProbeFromLookup('timeout', ECHO_PUBLIC_IP, `public ${ECHO_PUBLIC_IP}`)],
      configured: [],
      delegation: null,
    })

    expect(result.summary).toBe('failed')
    expect(result.hint).toContain('detected public IP')
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

  test('does not mark ok when delegation answers but echo public IP does not', () => {
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

    expect(result.summary).toBe('failed')
    expect(result.hint).toContain(DELEGATED_NS_IP)
  })
})

describe('port53 labels', () => {
  test('formats status and summary labels', () => {
    expect(port53StatusLabel('ok')).toBe('Reachable')
    expect(port53SummaryLabel('ok')).toBe('Port 53 reachable on public IP')
    expect(port53SummaryLabel('failed')).toBe('Port 53 not reachable on public IP')
  })

  test('maps summary to traffic-light tone', () => {
    expect(port53SummaryTone('ok')).toBe('ok')
    expect(port53SummaryTone('failed')).toBe('bad')
    expect(port53SummaryTone('unknown')).toBe('muted')
  })
})
