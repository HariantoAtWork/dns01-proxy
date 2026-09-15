import { afterEach, describe, expect, test } from 'bun:test'
import {
  DEFAULT_TXT_HOLD_MS,
  DEFAULT_TXT_SETTLE_MS,
  resolveAcmeTxtHoldMs,
  resolveAcmeTxtSettleMs,
  resolveTxtTtlSeconds,
} from '../runtime/shared/txtTtlConstants'

const ENV_KEYS = ['ACME_TXT_SETTLE_MS', 'ACME_TXT_HOLD_MS'] as const

function clearEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key]
  }
}

afterEach(() => {
  clearEnv()
})

describe('txt timing env', () => {
  test('defaults: settle 5s and hold 300s → lifetime 305s', () => {
    clearEnv()
    expect(resolveAcmeTxtSettleMs()).toBe(DEFAULT_TXT_SETTLE_MS)
    expect(resolveAcmeTxtHoldMs()).toBe(DEFAULT_TXT_HOLD_MS)
    expect(resolveTxtTtlSeconds()).toBe(305)
  })

  test('lifetime is settleMs + holdMs (ceil to seconds)', () => {
    process.env.ACME_TXT_SETTLE_MS = '12000'
    process.env.ACME_TXT_HOLD_MS = '40000'
    expect(resolveTxtTtlSeconds()).toBe(52)
  })

  test('settle 0 still keeps hold as lifetime', () => {
    process.env.ACME_TXT_SETTLE_MS = '0'
    process.env.ACME_TXT_HOLD_MS = '90000'
    expect(resolveAcmeTxtSettleMs()).toBe(0)
    expect(resolveTxtTtlSeconds()).toBe(90)
  })

  test('ignores removed legacy second-based env names', () => {
    process.env.ACME_TXT_HOLD_MS = '25000'
    ;(process.env as Record<string, string>).ACME_TXT_HOLD_SECONDS = '50'
    ;(process.env as Record<string, string>).ACME_TXT_TTL_SECONDS = '999'
    expect(resolveAcmeTxtHoldMs()).toBe(25_000)
    expect(resolveTxtTtlSeconds()).toBe(30)
  })
})
