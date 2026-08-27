import type { AcmeDnsConfig } from './types'
import { writeAcmeConfigFile } from './configWrite'
import type { AuthZoneGlueAddresses } from '../../plugins/client/runtime/shared/utils/glueRecords'
import {
  authZoneGlueRecords,
  formatGlueRecordLog,
  glueRecordsMatchDomain,
  recordsEqual,
  recordsUsePlaceholderIp,
} from '../../plugins/client/runtime/shared/utils/glueRecords'
import { lookupHostPublicIps } from '../../plugins/client/runtime/server/utils/publicIps'

import { envAcmednsPublicIp, envAcmednsPublicIpv6 } from '../../core/env'

function configuredPublicAddresses(): AuthZoneGlueAddresses {
  return {
    ipv4: envAcmednsPublicIp() || '',
    ipv6: envAcmednsPublicIpv6() || '',
  }
}

async function detectPublicAddresses(): Promise<AuthZoneGlueAddresses> {
  const configured = configuredPublicAddresses()
  if (configured.ipv4 && configured.ipv6) {
    return configured
  }

  try {
    const hits = await lookupHostPublicIps(true)
    return {
      ipv4: configured.ipv4 || hits.find(hit => hit.family === 4)?.address || '',
      ipv6: configured.ipv6 || hits.find(hit => hit.family === 6)?.address || '',
    }
  }
  catch (error) {
    console.warn('[acmedns] public IP detection failed', error)
    return configured
  }
}

function shouldRefreshGlueRecords(
  config: AcmeDnsConfig,
  addresses: AuthZoneGlueAddresses,
): boolean {
  const records = config.general.records
  if (!records.length) {
    return true
  }
  if (recordsUsePlaceholderIp(records)) {
    return true
  }
  if (!glueRecordsMatchDomain(records, config.general.domain, config.general.nsname, addresses)) {
    return true
  }

  const expected = authZoneGlueRecords(
    config.general.domain,
    addresses,
    config.general.nsname,
  )
  return !recordsEqual(records, expected)
}

/**
 * In shared (tiny) mode, set auth-zone glue A (+ AAAA when available) + NS.
 * Persists to config.cfg when records change.
 */
export async function ensureSharedModeGlueRecords(config: AcmeDnsConfig): Promise<boolean> {
  if (!config.api.shared_mode) {
    return false
  }

  const addresses = await detectPublicAddresses()
  if (!addresses.ipv4 && !addresses.ipv6) {
    console.warn(
      '[acmedns] shared mode: no public IP detected (set ACMEDNS_PUBLIC_IP / ACMEDNS_PUBLIC_IPV6'
      + ' or fix outbound HTTPS); keeping existing glue records',
    )
    return false
  }

  if (!shouldRefreshGlueRecords(config, addresses)) {
    return false
  }

  const next = authZoneGlueRecords(
    config.general.domain,
    addresses,
    config.general.nsname,
  )

  if (recordsEqual(config.general.records, next)) {
    return false
  }

  config.general.records = next
  await writeAcmeConfigFile(config)

  console.info(`[acmedns] shared mode glue records → ${formatGlueRecordLog(config.general.domain, addresses)}`)
  return true
}
