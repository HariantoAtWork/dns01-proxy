import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resetAppSettingsCoreCache } from '../../../core/appSettings'
import {
  DEFAULT_TXT_HOLD_MS,
  DEFAULT_TXT_SETTLE_MS,
  resolveAcmeTxtHoldMs,
  resolveAcmeTxtHoldMsSource,
  resolveAcmeTxtSettleMs,
  resolveAcmeTxtSettleMsSource,
  resolveTxtTtlSeconds,
} from '../runtime/shared/txtTtlConstants'

const ENV_KEYS = ['ACME_TXT_SETTLE_MS', 'ACME_TXT_HOLD_MS', 'ACMEDNS_DATA_ROOT'] as const

let tempRoot = ''
let savedEnv: Record<string, string | undefined> = {}

function clearEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key]
  }
}

function writeAppSettings(data: Record<string, unknown>) {
  writeFileSync(
    join(tempRoot, 'client', 'app-settings.json'),
    `${JSON.stringify(data, null, 2)}\n`,
    'utf-8',
  )
  resetAppSettingsCoreCache()
}

beforeEach(() => {
  savedEnv = {}
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
  }
  clearEnv()
  tempRoot = mkdtempSync(join(tmpdir(), 'acmedns-txt-ttl-'))
  mkdirSync(join(tempRoot, 'client'), { recursive: true })
  process.env.ACMEDNS_DATA_ROOT = tempRoot
  resetAppSettingsCoreCache()
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key]
    }
    else {
      process.env[key] = savedEnv[key]
    }
  }
  resetAppSettingsCoreCache()
  rmSync(tempRoot, { recursive: true, force: true })
})

describe('txt timing env', () => {
  test('defaults: settle 5s and hold 300s → lifetime 305s', () => {
    expect(resolveAcmeTxtSettleMs()).toBe(DEFAULT_TXT_SETTLE_MS)
    expect(resolveAcmeTxtHoldMs()).toBe(DEFAULT_TXT_HOLD_MS)
    expect(resolveTxtTtlSeconds()).toBe(305)
    expect(resolveAcmeTxtSettleMsSource().source).toBe('default')
    expect(resolveAcmeTxtHoldMsSource().source).toBe('default')
  })

  test('lifetime is settleMs + holdMs (ceil to seconds)', () => {
    process.env.ACME_TXT_SETTLE_MS = '12000'
    process.env.ACME_TXT_HOLD_MS = '40000'
    expect(resolveTxtTtlSeconds()).toBe(52)
    expect(resolveAcmeTxtSettleMsSource().source).toBe('compose/env')
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

  test('app-settings override wins over compose env', () => {
    process.env.ACME_TXT_SETTLE_MS = '12000'
    process.env.ACME_TXT_HOLD_MS = '40000'
    writeAppSettings({ acmeTxtSettleMs: 2000, acmeTxtHoldMs: 8000 })
    expect(resolveAcmeTxtSettleMs()).toBe(2000)
    expect(resolveAcmeTxtHoldMs()).toBe(8000)
    expect(resolveTxtTtlSeconds()).toBe(10)
    expect(resolveAcmeTxtSettleMsSource()).toEqual({ value: 2000, source: 'app-settings' })
    expect(resolveAcmeTxtHoldMsSource()).toEqual({ value: 8000, source: 'app-settings' })
  })

  test('app-settings settle 0 is allowed', () => {
    writeAppSettings({ acmeTxtSettleMs: 0, acmeTxtHoldMs: 60_000 })
    expect(resolveAcmeTxtSettleMs()).toBe(0)
    expect(resolveTxtTtlSeconds()).toBe(60)
  })
})
