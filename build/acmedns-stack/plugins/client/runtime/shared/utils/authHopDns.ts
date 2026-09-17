import {
  authZoneTxtLabel,
  stripZoneFqdn,
  tinyApexLabel,
  type TinyPublishSlot,
} from './tinyModeDns'

/**
 * Entry label for the dynamic CNAME hop: last auth-zone landing from the
 * public CNAME chain, else the encoded Tiny apex label.
 */
export function resolveAuthHopEntryLabel(
  certName: string,
  authZone: string,
  cnameTargets: string[],
): string {
  const zone = stripZoneFqdn(authZone)
  for (let i = cnameTargets.length - 1; i >= 0; i -= 1) {
    const label = authZoneTxtLabel(cnameTargets[i]!, zone)
    if (label) {
      return label
    }
  }
  return tinyApexLabel(certName)
}

export function planAuthHopPublishSlot(options: {
  hopLabel: string
  localServerUrl: string
  authZone: string
}): TinyPublishSlot {
  return {
    subdomain: options.hopLabel,
    serverUrl: options.localServerUrl.replace(/\/$/, ''),
    local: true,
    authZone: stripZoneFqdn(options.authZone),
  }
}
