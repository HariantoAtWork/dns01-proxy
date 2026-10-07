import type { AcmeDnsCredentials } from '#shared/types/clientstorage'

/** Fixed username for shared-mode /update (UUID-shaped for header validation). */
export const SHARED_MODE_USERNAME = '00000000-0000-4000-8000-000000000001'

export function stripZoneFqdn(zone: string) {
  return zone.trim().replace(/\.$/, '').toLowerCase()
}

/** TXT DB key when CNAME targets the auth zone apex (e.g. auth.uti.email → "auth"). */
export function zoneApexTxtSubdomain(zone: string) {
  const fqdn = stripZoneFqdn(zone)
  const dot = fqdn.indexOf('.')
  return dot > 0 ? fqdn.slice(0, dot) : fqdn
}

/**
 * Tiny mode DNS label for an apex: `mdstn.com` → `_mdstn-com_`.
 * Dots become hyphens; wrapped in underscores so it cannot collide with UUIDs.
 */
export function tinyApexLabel(apex: string): string {
  const host = stripZoneFqdn(apex)
  if (!host) {
    return ''
  }
  return `_${host.replace(/\./g, '-')}_`
}

/** Tiny CNAME target: `_mdstn-com_.auth.uti.email`. */
export function tinyApexFulldomain(apex: string, authZone: string): string {
  const label = tinyApexLabel(apex)
  const zone = stripZoneFqdn(authZone)
  if (!label || !zone) {
    return ''
  }
  return `${label}.${zone}`
}

/**
 * TXT store key for a name under the auth zone.
 * `uuid.auth.mdstn.com` → `uuid`; `_mdstn-com_.auth.mdstn.com` → `_mdstn-com_`;
 * zone apex → first label (`auth`).
 */
export function authZoneTxtLabel(fqdn: string, authZone: string): string | null {
  const name = stripZoneFqdn(fqdn)
  const zone = stripZoneFqdn(authZone)
  if (!name || !zone) {
    return null
  }
  if (name === zone) {
    return zoneApexTxtSubdomain(zone)
  }
  if (!name.endsWith(`.${zone}`)) {
    return null
  }
  const rest = name.slice(0, name.length - zone.length - 1)
  const label = rest.split('.')[0]?.trim()
  return label || null
}

/**
 * Shared/Tiny publish keys: always the encoded apex label, plus any live CNAME
 * targets under the auth zone (legacy UUID or arbitrary labels).
 */
export function mergeSharedPublishSubdomains(
  certName: string,
  authZone: string,
  cnameTargets: string[],
): string[] {
  const out: string[] = []
  const encoded = tinyApexLabel(certName)
  if (encoded) {
    out.push(encoded)
  }
  for (const target of cnameTargets) {
    const label = authZoneTxtLabel(target, authZone)
    if (label && !out.includes(label)) {
      out.push(label)
    }
  }
  return out
}

/** Parse ACMEDNS_TINY_ACCEPT_ZONES (comma/space/semicolon separated). */
export function parseTinyAcceptZones(raw?: string): string[] {
  return parseTinyAcceptZoneEntries(raw).map(entry => entry.zone)
}

export interface TinyAcceptZoneEntry {
  zone: string
  /** Optional control URL override (`zone|https://…` or `zone=https://…`). */
  serverUrl?: string
}

/**
 * Parse ACMEDNS_TINY_ACCEPT_ZONES entries.
 * Forms: `auth.a.com`, `auth.b.com|https://auth.b.com:1443`, `auth.c.com=https://auth.c.com`
 */
export function parseTinyAcceptZoneEntries(raw?: string): TinyAcceptZoneEntry[] {
  const source = (raw ?? process.env.ACMEDNS_TINY_ACCEPT_ZONES ?? '').trim()
  if (!source) {
    return []
  }
  const out: TinyAcceptZoneEntry[] = []
  const seen = new Set<string>()
  for (const part of source.split(/[,;\s]+/)) {
    const token = part.trim()
    if (!token) {
      continue
    }
    let zone = token
    let serverUrl: string | undefined
    const pipe = token.indexOf('|')
    const eq = token.indexOf('=')
    const sep = pipe >= 0 ? pipe : eq >= 0 ? eq : -1
    if (sep > 0) {
      zone = token.slice(0, sep).trim()
      serverUrl = token.slice(sep + 1).trim().replace(/\/$/, '') || undefined
    }
    const normalised = stripZoneFqdn(zone)
    if (!normalised || seen.has(normalised)) {
      continue
    }
    seen.add(normalised)
    out.push({ zone: normalised, serverUrl })
  }
  return out
}

/**
 * Auth zones Tiny DNS checks trust: this server’s zone plus optional remotes
 * from ACMEDNS_TINY_ACCEPT_ZONES.
 */
export function tinyPreflightAcceptZones(localAuthZone: string, rawExtraZones?: string): string[] {
  const local = stripZoneFqdn(localAuthZone)
  return [...new Set([local, ...parseTinyAcceptZones(rawExtraZones)].filter(Boolean))]
}

export function tinyAcceptZoneServerUrls(rawExtraZones?: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const entry of parseTinyAcceptZoneEntries(rawExtraZones)) {
    if (entry.serverUrl) {
      map[entry.zone] = entry.serverUrl
    }
  }
  return map
}

/**
 * Split `label.auth.zone` (or zone apex) using known zones, else the Tiny
 * convention `*.auth.<parent>` (so peers like auth.uti.email work without an allowlist).
 * Never falls back to arbitrary site names (`_acme-challenge.harianto.dev`).
 */
export function splitTinyAuthFqdn(
  fqdn: string,
  knownZones: string[],
): { label: string, zone: string } | null {
  const name = stripZoneFqdn(fqdn)
  if (!name) {
    return null
  }
  const zones = [...new Set(knownZones.map(stripZoneFqdn).filter(Boolean))]
    .sort((a, b) => b.length - a.length)

  for (const zone of zones) {
    if (name === zone) {
      return { label: zoneApexTxtSubdomain(zone), zone }
    }
    if (name.endsWith(`.${zone}`)) {
      const rest = name.slice(0, name.length - zone.length - 1)
      const label = rest.split('.')[0]?.trim()
      if (label) {
        return { label, zone }
      }
    }
  }

  const parts = name.split('.')
  const authIdx = parts.indexOf('auth')
  if (authIdx < 0) {
    return null
  }
  // Zone apex: auth.uti.email
  if (authIdx === 0) {
    if (parts.length < 2) {
      return null
    }
    return { label: zoneApexTxtSubdomain(name), zone: name }
  }
  // label.auth.uti.email (auth must be followed by at least one parent label)
  if (authIdx >= parts.length - 1) {
    return null
  }
  const label = parts[0]?.trim()
  const zone = parts.slice(authIdx).join('.')
  if (!label || !zone.startsWith('auth.')) {
    return null
  }
  return { label, zone }
}

export interface TinyPublishSlot {
  subdomain: string
  serverUrl: string
  local: boolean
  authZone: string
}

/**
 * Local encoded label plus every live CNAME target — local in-process or remote
 * HTTP /update when the target sits on another Tiny auth zone.
 */
export function planTinyPublishSlots(options: {
  certName: string
  localAuthZone: string
  localServerUrl: string
  cnameTargets: string[]
  zoneServerUrls?: Record<string, string>
}): TinyPublishSlot[] {
  const localZone = stripZoneFqdn(options.localAuthZone)
  const localUrl = options.localServerUrl.replace(/\/$/, '')
  const zoneUrls = options.zoneServerUrls ?? tinyAcceptZoneServerUrls()
  const knownZones = [...new Set([localZone, ...Object.keys(zoneUrls), ...parseTinyAcceptZones()])]
  const slots: TinyPublishSlot[] = []
  const seen = new Set<string>()

  const add = (slot: TinyPublishSlot) => {
    const key = `${slot.local ? 'local' : slot.serverUrl}|${slot.subdomain}`
    if (seen.has(key) || !slot.subdomain) {
      return
    }
    seen.add(key)
    slots.push(slot)
  }

  const encoded = tinyApexLabel(options.certName)
  if (encoded && localZone) {
    add({
      subdomain: encoded,
      serverUrl: localUrl,
      local: true,
      authZone: localZone,
    })
  }

  for (const target of options.cnameTargets) {
    const parsed = splitTinyAuthFqdn(target, knownZones)
    if (!parsed) {
      continue
    }
    if (parsed.zone === localZone) {
      add({
        subdomain: parsed.label,
        serverUrl: localUrl,
        local: true,
        authZone: parsed.zone,
      })
      continue
    }
    const serverUrl = (zoneUrls[parsed.zone] || `https://${parsed.zone}`).replace(/\/$/, '')
    add({
      subdomain: parsed.label,
      serverUrl,
      local: false,
      authZone: parsed.zone,
    })
  }

  return slots
}

/** Auth zone hostname (glue / NS). Per-apex CNAME targets use tinyApexFulldomain. */
export function sharedCnameTarget(zone: string) {
  return stripZoneFqdn(zone)
}

export function buildSharedCredentials(options: {
  authZone: string
  serverUrl: string
  username: string
  password: string
}): AcmeDnsCredentials {
  const authZone = stripZoneFqdn(options.authZone)
  return {
    fulldomain: authZone,
    subdomain: zoneApexTxtSubdomain(authZone),
    username: options.username,
    password: options.password,
    server_url: options.serverUrl.replace(/\/$/, ''),
  }
}

export interface SharedModeContext {
  authZone: string
  serverUrl: string
  account: AcmeDnsCredentials
}
