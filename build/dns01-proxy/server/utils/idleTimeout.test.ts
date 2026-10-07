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
  test('edge and control default to 255s', () => {
    expect(resolveIdleTimeoutSeconds('edge')).toBe(DEFAULT_EDGE_IDLE_TIMEOUT_SECONDS)
    expect(resolveIdleTimeoutSeconds('control')).toBe(DEFAULT_CONTROL_IDLE_TIMEOUT_SECONDS)
    expect(DEFAULT_EDGE_IDLE_TIMEOUT_SECONDS).toBe(255)
    expect(DEFAULT_CONTROL_IDLE_TIMEOUT_SECONDS).toBe(255)
  })

  test('0 disables idle timeout; clamps above 255', () => {
    process.env.NITRO_BUN_IDLE_TIMEOUT = '0'
    expect(resolveIdleTimeoutSeconds('edge')).toBe(0)
    expect(resolveIdleTimeoutSeconds('control')).toBe(0)
    process.env.NITRO_BUN_IDLE_TIMEOUT = '999'
    expect(resolveIdleTimeoutSeconds('edge')).toBe(255)
    expect(resolveIdleTimeoutSeconds('control')).toBe(255)
  })
})
