import { promises as fs } from 'node:fs'
import type { AcmeDnsConfig } from './types'
import { getAcmeConfig, resetAcmeConfigCache } from './config'
import { getServerConfigPath } from './paths'

function quoteTomlString(value: string): string {
  return JSON.stringify(value)
}

function formatTomlArray(values: string[]): string {
  if (!values.length) {
    return '[]'
  }
  const lines = values.map(item => `    ${quoteTomlString(item)},`)
  return `[\n${lines.join('\n')}\n]`
}

export function serializeAcmeConfig(config: AcmeDnsConfig): string {
  const g = config.general
  const d = config.database
  const a = config.api
  const l = config.logconfig

  const apiExtra: string[] = []
  if (a.tls_cert_privkey) {
    apiExtra.push(`tls_cert_privkey = ${quoteTomlString(a.tls_cert_privkey)}`)
  }
  if (a.tls_cert_fullchain) {
    apiExtra.push(`tls_cert_fullchain = ${quoteTomlString(a.tls_cert_fullchain)}`)
  }
  if (a.acme_cache_dir) {
    apiExtra.push(`acme_cache_dir = ${quoteTomlString(a.acme_cache_dir)}`)
  }
  if (a.notification_email) {
    apiExtra.push(`notification_email = ${quoteTomlString(a.notification_email)}`)
  }

  return `[general]
listen = ${quoteTomlString(g.listen)}
protocol = ${quoteTomlString(g.protocol)}
domain = ${quoteTomlString(g.domain)}
nsname = ${quoteTomlString(g.nsname)}
nsadmin = ${quoteTomlString(g.nsadmin)}
records = ${formatTomlArray(g.records)}
debug = ${g.debug}

[database]
engine = ${quoteTomlString(d.engine)}
connection = ${quoteTomlString(d.connection)}

[api]
ip = ${quoteTomlString(a.ip)}
port = ${quoteTomlString(a.port)}
disable_registration = ${a.disable_registration}
tls = ${quoteTomlString(a.tls)}
${apiExtra.length ? `${apiExtra.join('\n')}\n` : ''}corsorigins = ${formatTomlArray(a.corsorigins)}
use_header = ${a.use_header}
header_name = ${quoteTomlString(a.header_name)}

[logconfig]
loglevel = ${quoteTomlString(l.loglevel)}
logtype = ${quoteTomlString(l.logtype)}
logformat = ${quoteTomlString(l.logformat)}
`
}

export function bindRestartReasons(before: AcmeDnsConfig, after: AcmeDnsConfig): string[] {
  const reasons: string[] = []
  if (before.general.listen !== after.general.listen) {
    reasons.push('DNS listen address changed')
  }
  if (before.api.ip !== after.api.ip || before.api.port !== after.api.port) {
    reasons.push('HTTP API bind changed')
  }
  if (before.api.tls !== after.api.tls) {
    reasons.push('API TLS mode changed')
  }
  return reasons
}

export async function writeAcmeConfigFile(config: AcmeDnsConfig): Promise<void> {
  const path = getServerConfigPath()
  const text = serializeAcmeConfig(config)
  const tmp = `${path}.${process.pid}.tmp`
  await fs.writeFile(tmp, text, 'utf-8')
  await fs.rename(tmp, path)
  resetAcmeConfigCache()
  getAcmeConfig()
}
