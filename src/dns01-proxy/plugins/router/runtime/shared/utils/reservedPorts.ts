/**
 * Ports always claimed by dns01-proxy itself (DNS + Bun edge + control).
 * Router maps must not bind these.
 */
export const ROUTER_RESERVED_PORTS: ReadonlyArray<{ port: number, label: string }> = [
  { port: 53, label: 'DNS' },
  { port: 80, label: 'edge HTTP' },
  { port: 443, label: 'edge HTTPS' },
  { port: 1080, label: 'control HTTP' },
  { port: 1443, label: 'control HTTPS' },
]

const reservedByPort = new Map(ROUTER_RESERVED_PORTS.map(item => [item.port, item.label]))

export function reservedPortLabel(port: number): string | null {
  return reservedByPort.get(port) ?? null
}

export function isReservedRouterPort(port: number): boolean {
  return reservedByPort.has(port)
}
