import { describe, expect, test } from 'bun:test'
import { renderConfigTemplateValidated } from '../../core/renderConfigTemplate'
import { DEFAULT_ACME_DNS_CONFIG_TEMPLATE } from './defaultConfig'

describe('DEFAULT_ACME_DNS_CONFIG_TEMPLATE', () => {
  test('keeps literal ${AUTH_DOMAIN} placeholders (not JS interpolation)', () => {
    expect(DEFAULT_ACME_DNS_CONFIG_TEMPLATE).toContain('${AUTH_DOMAIN}')
    expect(DEFAULT_ACME_DNS_CONFIG_TEMPLATE).toContain('${APEX}')
    expect(DEFAULT_ACME_DNS_CONFIG_TEMPLATE).not.toContain('undefined')
  })

  test('renders through config template resolver', () => {
    process.env.APEX = 'example.org'
    process.env.AUTH_DOMAIN = 'auth.example.org'
    const rendered = renderConfigTemplateValidated(DEFAULT_ACME_DNS_CONFIG_TEMPLATE, 'production')
    expect(rendered).toContain('domain = "auth.example.org"')
    expect(rendered).toContain('/etc/letsencrypt/live/example.org/fullchain.pem')
    delete process.env.APEX
    delete process.env.AUTH_DOMAIN
  })
})
