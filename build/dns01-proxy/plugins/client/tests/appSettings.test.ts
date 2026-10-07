import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  resetAppSettingsCache,
  resolveAcmednsUrl,
  resolveDefaultAcmednsUrl,
  resolveLetsencryptEmail,
  resolveRenewIntervalHours,
  resolveTimezone,
} from '../runtime/server/utils/appSettings'

const ENV_KEYS = [
  'ACMEDNS_DATA_ROOT',
  'APEX',
  'AUTH_DOMAIN',
  'ACMEDNS_URL',
  'NUXT_ACMEDNS_URL',
  'NUXT_PUBLIC_DEFAULT_ACMEDNS_URL',
  'LETSENCRYPT_EMAIL',
  'NUXT_LETSENCRYPT_EMAIL',
  'RENEW_INTERVAL',
  'TZ',
] as const

let tempRoot = ''
let savedEnv: Record<string, string | undefined> = {}

function writeAppSettings(data: Record<string, unknown>) {
  writeFileSync(
    join(tempRoot, 'client', 'app-settings.json'),
    `${JSON.stringify(data, null, 2)}\n`,
    'utf-8',
  )
}

function clearEnv(key: string) {
  delete process.env[key]
}

function setRuntimeConfig(config: Record<string, unknown>) {
  ;(globalThis as { useRuntimeConfig?: () => Record<string, unknown> }).useRuntimeConfig = () => config
}

function clearRuntimeConfig() {
  delete (globalThis as { useRuntimeConfig?: () => Record<string, unknown> }).useRuntimeConfig
}

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'acmedns-app-settings-'))
  mkdirSync(join(tempRoot, 'client'), { recursive: true })

  savedEnv = {}
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
    clearEnv(key)
  }

  process.env.ACMEDNS_DATA_ROOT = tempRoot
  clearRuntimeConfig()
  resetAppSettingsCache()
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      clearEnv(key)
    }
    else {
      process.env[key] = savedEnv[key]
    }
  }

  clearRuntimeConfig()
  resetAppSettingsCache()
  rmSync(tempRoot, { recursive: true, force: true })
})

describe('resolveAcmednsUrl', () => {
  test('defaults to loopback when nothing is configured', () => {
    expect(resolveAcmednsUrl()).toEqual({ value: 'http://127.0.0.1', source: 'default' })
  })

  test('derives from APEX when ACMEDNS_URL unset', () => {
    process.env.APEX = 'example.test'
    resetAppSettingsCache()
    expect(resolveAcmednsUrl()).toEqual({
      value: 'https://auth.example.test',
      source: 'compose/env',
    })
  })

  test('prefers compose env over default', () => {
    process.env.ACMEDNS_URL = 'https://env-acme.example.test/'
    resetAppSettingsCache()

    expect(resolveAcmednsUrl()).toEqual({
      value: 'https://env-acme.example.test',
      source: 'compose/env',
    })
  })

  test('prefers app-settings file over compose env', () => {
    process.env.ACMEDNS_URL = 'https://env-acme.example.test'
    writeAppSettings({ acmednsUrl: 'https://file-acme.example.test/' })
    resetAppSettingsCache()

    expect(resolveAcmednsUrl()).toEqual({
      value: 'https://file-acme.example.test',
      source: 'app-settings',
    })
  })

  test('falls back to runtimeConfig when file and env are empty', () => {
    setRuntimeConfig({ acmednsUrl: 'https://runtime-acme.example.test/' })
    resetAppSettingsCache()

    expect(resolveAcmednsUrl()).toEqual({
      value: 'https://runtime-acme.example.test',
      source: 'compose/env',
    })
  })

  test('accepts NUXT_ACMEDNS_URL as compose env alias', () => {
    process.env.NUXT_ACMEDNS_URL = 'https://nuxt-acme.example.test'
    resetAppSettingsCache()

    expect(resolveAcmednsUrl()).toEqual({
      value: 'https://nuxt-acme.example.test',
      source: 'compose/env',
    })
  })
})

describe('resolveDefaultAcmednsUrl', () => {
  test('falls back to resolveAcmednsUrl when unset', () => {
    process.env.ACMEDNS_URL = 'https://primary.example.test'
    resetAppSettingsCache()

    expect(resolveDefaultAcmednsUrl()).toEqual({
      value: 'https://primary.example.test',
      source: 'compose/env',
    })
  })

  test('prefers app-settings default over env and runtime', () => {
    process.env.NUXT_PUBLIC_DEFAULT_ACMEDNS_URL = 'https://env-default.example.test'
    writeAppSettings({ defaultAcmednsUrl: 'https://file-default.example.test/' })
    setRuntimeConfig({ public: { defaultAcmednsUrl: 'https://runtime-default.example.test' } })
    resetAppSettingsCache()

    expect(resolveDefaultAcmednsUrl()).toEqual({
      value: 'https://file-default.example.test',
      source: 'app-settings',
    })
  })
})

describe('resolveLetsencryptEmail', () => {
  test('uses env then runtime then default', () => {
    setRuntimeConfig({ letsencryptEmail: 'runtime@example.test' })
    resetAppSettingsCache()
    expect(resolveLetsencryptEmail()).toEqual({
      value: 'runtime@example.test',
      source: 'compose/env',
    })

    process.env.LETSENCRYPT_EMAIL = 'env@example.test'
    resetAppSettingsCache()
    expect(resolveLetsencryptEmail()).toEqual({
      value: 'env@example.test',
      source: 'compose/env',
    })

    writeAppSettings({ letsencryptEmail: 'file@example.test' })
    resetAppSettingsCache()
    expect(resolveLetsencryptEmail()).toEqual({
      value: 'file@example.test',
      source: 'app-settings',
    })
  })
})

describe('resolveRenewIntervalHours', () => {
  test('respects file override and numeric env', () => {
    process.env.RENEW_INTERVAL = '6'
    resetAppSettingsCache()
    expect(resolveRenewIntervalHours()).toEqual({ value: 6, source: 'compose/env' })

    writeAppSettings({ renewInterval: 24 })
    resetAppSettingsCache()
    expect(resolveRenewIntervalHours()).toEqual({ value: 24, source: 'app-settings' })
  })
})

describe('resolveTimezone', () => {
  test('prefers file over env and defaults to UTC', () => {
    expect(resolveTimezone()).toEqual({ value: 'UTC', source: 'default' })

    process.env.TZ = 'Europe/Amsterdam'
    resetAppSettingsCache()
    expect(resolveTimezone()).toEqual({ value: 'Europe/Amsterdam', source: 'compose/env' })

    writeAppSettings({ tz: 'America/New_York' })
    resetAppSettingsCache()
    expect(resolveTimezone()).toEqual({ value: 'America/New_York', source: 'app-settings' })
  })
})
