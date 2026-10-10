import { connect as netConnect } from 'node:net'
import type { RouterSource } from '../../shared/types/routerSource'
import type { RouterTarget } from '../../shared/types/routerTarget'
import { listActiveRouterBinds } from '../../../../../server/router/runtime'

export type RouterPortHealth = {
  protocol: 'tcp' | 'udp'
  listenPort: number
  targetPort: number
  bound: boolean
  online?: boolean
  latencyMs?: number
  error?: string
}

function probeTcp(host: string, port: number, timeoutMs = 2000): Promise<{ online: boolean, latencyMs?: number, error?: string }> {
  const started = Date.now()
  return new Promise((resolve) => {
    const socket = netConnect({ host, port })
    const done = (result: { online: boolean, latencyMs?: number, error?: string }) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => {
      done({ online: true, latencyMs: Date.now() - started })
    })
    socket.once('timeout', () => {
      done({ online: false, error: 'timeout' })
    })
    socket.once('error', (error) => {
      done({ online: false, error: error.message })
    })
  })
}

export async function probeRouterSourceHealth(
  source: RouterSource,
  target: RouterTarget | null,
): Promise<{ online: boolean, ports: RouterPortHealth[] }> {
  const active = new Set(listActiveRouterBinds().map(bind => `${bind.protocol}:${bind.listenPort}`))
  const ports: RouterPortHealth[] = []

  for (const map of source.portMaps) {
    const key = `${map.protocol}:${map.listenPort}`
    const bound = active.has(key) && source.enabled && Boolean(target?.enabled)
    if (map.protocol === 'udp') {
      ports.push({
        protocol: 'udp',
        listenPort: map.listenPort,
        targetPort: map.targetPort,
        bound,
      })
      continue
    }
    if (!target || !source.enabled || !target.enabled) {
      ports.push({
        protocol: 'tcp',
        listenPort: map.listenPort,
        targetPort: map.targetPort,
        bound,
        online: false,
        error: !target ? 'target missing' : 'disabled',
      })
      continue
    }
    const probe = await probeTcp(target.host, map.targetPort)
    ports.push({
      protocol: 'tcp',
      listenPort: map.listenPort,
      targetPort: map.targetPort,
      bound,
      online: probe.online,
      latencyMs: probe.latencyMs,
      error: probe.error,
    })
  }

  const tcpPorts = ports.filter(port => port.protocol === 'tcp')
  const online = tcpPorts.length
    ? tcpPorts.every(port => port.online)
    : ports.every(port => port.bound)

  return { online, ports }
}
