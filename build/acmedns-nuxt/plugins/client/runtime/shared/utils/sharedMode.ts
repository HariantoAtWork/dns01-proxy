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

/** CNAME target operators publish at their registrar (zone apex, no UUID label). */
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
