import { afterEach, describe, expect, test } from 'bun:test'
import {
  DEFAULT_CONTROL_IDLE_TIMEOUT_SECONDS,
  DEFAULT_EDGE_IDLE_TIMEOUT_SECONDS,
  resolveIdleTimeoutSeconds,
} from './idleTimeout'

afterEach(() => {
  delete process.env.NITRO_BUN_IDLE_TIMEOUT
})

describe('resolveIdleTimeoutSeconds', () => {
  test('edge and control default to 120s', () => {
    expect(resolveIdleTimeoutSeconds('edge')).toBe(DEFAULT_EDGE_IDLE_TIMEOUT_SECONDS)
    expect(resolveIdleTimeoutSeconds('control')).toBe(DEFAULT_CONTROL_IDLE_TIMEOUT_SECONDS)
  })

  test('0 means Bun default; clamps to 255', () => {
    process.env.NITRO_BUN_IDLE_TIMEOUT = '0'
    expect(resolveIdleTimeoutSeconds('edge')).toBeUndefined()
    expect(resolveIdleTimeoutSeconds('control')).toBeUndefined()
    process.env.NITRO_BUN_IDLE_TIMEOUT = '999'
    expect(resolveIdleTimeoutSeconds('edge')).toBe(255)
    expect(resolveIdleTimeoutSeconds('control')).toBe(255)
  })
})
