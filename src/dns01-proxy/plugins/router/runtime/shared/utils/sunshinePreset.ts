import type { RouterPortMap } from '../types/routerSource'

/**
 * Sunshine / Moonlight internet streaming ports (passthrough).
 * @see https://github.com/moonlight-stream/moonlight-docs/wiki/Setup-Guide
 */
export const SUNSHINE_MOONLIGHT_PORT_MAPS: readonly RouterPortMap[] = [
  { protocol: 'tcp', listenPort: 47984, targetPort: 47984 },
  { protocol: 'tcp', listenPort: 47989, targetPort: 47989 },
  { protocol: 'tcp', listenPort: 47990, targetPort: 47990 },
  { protocol: 'tcp', listenPort: 48010, targetPort: 48010 },
  { protocol: 'udp', listenPort: 47998, targetPort: 47998 },
  { protocol: 'udp', listenPort: 47999, targetPort: 47999 },
  { protocol: 'udp', listenPort: 48000, targetPort: 48000 },
  { protocol: 'udp', listenPort: 48002, targetPort: 48002 },
  { protocol: 'udp', listenPort: 48010, targetPort: 48010 },
] as const

export function sunshineMoonlightPortMaps(): RouterPortMap[] {
  return SUNSHINE_MOONLIGHT_PORT_MAPS.map(map => ({ ...map }))
}
