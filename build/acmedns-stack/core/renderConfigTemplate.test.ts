import { afterEach, describe, expect, test } from 'bun:test'
import { parse } from 'smol-toml'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  configTemplatePathFor,
  renderConfigTemplate,
  renderConfigTemplateValidated,
  resolveConfigTemplateVars,
} from './renderConfigTemplate'

const KEYS = ['APEX', 'AUTH_DOMAIN', 'ACMEDNS_TINY_DOMAIN'] as const
const saved: Record<string, string | undefined> = {}

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key]
    }
    else {
      process.env[key] = saved[key]
    }
  }
})

function clearEnv() {
  for (const key of KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
}

describe('configTemplatePathFor', () => {
  test('appends .template when missing', () => {
    expect(configTemplatePathFor('seed/server/config.cfg')).toBe('seed/server/config.cfg.template')
    expect(configTemplatePathFor('seed/server/config.cfg.template')).toBe('seed/server/config.cfg.template')
  })
})

describe('resolveConfigTemplateVars', () => {
  test('derives from APEX and AUTH_DOMAIN env', () => {
    clearEnv()
    process.env.APEX = 'my.example'
    process.env.AUTH_DOMAIN = 'auth.${APEX}'
    expect(resolveConfigTemplateVars('production')).toEqual({
      APEX: 'my.example',
      AUTH_DOMAIN: 'auth.my.example',
      NSADMIN: 'admin.my.example',
    })
  })

  test('uses dev defaults when env unset', () => {
    clearEnv()
    expect(resolveConfigTemplateVars('dev')).toEqual({
      APEX: 'example.test',
      AUTH_DOMAIN: 'auth.example.test',
      NSADMIN: 'admin.example.test',
    })
  })
})

describe('renderConfigTemplateValidated', () => {
  test('renders production template from disk', () => {
    clearEnv()
    process.env.APEX = 'example.org'
    process.env.AUTH_DOMAIN = 'auth.${APEX}'
    const template = readFileSync(
      resolve(import.meta.dir, '../seed/server/config.cfg.template'),
      'utf8',
    )
    const rendered = renderConfigTemplateValidated(template, 'production')
    const parsed = parse(rendered) as { general: { domain: string, nsadmin: string } }
    expect(parsed.general.domain).toBe('auth.example.org')
    expect(parsed.general.nsadmin).toBe('admin.example.org')
    expect(rendered).toContain('/etc/letsencrypt/live/auth.example.org/fullchain.pem')
  })

  test('leaves unknown placeholders unchanged', () => {
    clearEnv()
    expect(renderConfigTemplate('value = "${UNKNOWN}"', 'production')).toBe('value = "${UNKNOWN}"')
  })
})
