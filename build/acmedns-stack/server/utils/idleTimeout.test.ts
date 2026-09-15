import { afterEach, describe, expect, test } from 'bun:test'
import {
  DEFAULT_EDGE_IDLE_TIMEOUT_SECONDS,
  resolveIdleTimeoutSeconds,
} from './idleTimeout'

afterEach(() => {
  delete process.env.NITRO_BUN_IDLE_TIMEOUT
})

describe('resolveIdleTimeoutSeconds', () => {
  test('edge defaults to 120s; control leaves Bun default', () => {
    expect(resolveIdleTimeoutSeconds('edge')).toBe(DEFAULT_EDGE_IDLE_TIMEOUT_SECONDS)
    expect(resolveIdleTimeoutSeconds('control')).toBeUndefined()
  })

  test('0 means Bun default; clamps to 255', () => {
    process.env.NITRO_BUN_IDLE_TIMEOUT = '0'
    expect(resolveIdleTimeoutSeconds('edge')).toBeUndefined()
    process.env.NITRO_BUN_IDLE_TIMEOUT = '999'
    expect(resolveIdleTimeoutSeconds('edge')).toBe(255)
  })
})
