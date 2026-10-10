import { existsSync, readFileSync } from 'node:fs'
import type { RouterSource, RouterSourcesFile } from '../../plugins/router/runtime/shared/types/routerSource'
import type { RouterTarget, RouterTargetsFile } from '../../plugins/router/runtime/shared/types/routerTarget'
import { normalizeRouterSourcesFile } from '../../plugins/router/runtime/shared/utils/routerSource'
import { normalizeRouterTargetsFile } from '../../plugins/router/runtime/shared/utils/routerTarget'
import { getRouterSourcesFilePath, getRouterTargetsFilePath } from '../../core/paths'
import { routerLog } from './log'
import { startTcpForward, type TcpForwardHandle } from './tcp'
import { startUdpForward, type UdpForwardHandle } from './udp'

export type RouterBindSpec = {
  key: string
  protocol: 'tcp' | 'udp'
  listenPort: number
  targetHost: string
  targetPort: number
  sourceId: string
  targetId: string
}

type ForwardHandle = TcpForwardHandle | UdpForwardHandle

const active = new Map<string, ForwardHandle>()
let listenHost = process.env.NITRO_HOST || process.env.HOST || '0.0.0.0'
let reloadChain: Promise<void> = Promise.resolve()

export function setRouterListenHost(host: string): void {
  listenHost = host.trim() || '0.0.0.0'
}

export function loadRouterTargetsFromDisk(): RouterTarget[] {
  const filePath = getRouterTargetsFilePath()
  if (!existsSync(filePath)) {
    return []
  }
  try {
    const file = normalizeRouterTargetsFile(JSON.parse(readFileSync(filePath, 'utf8')) as RouterTargetsFile)
    return file.targets
  }
  catch (error) {
    routerLog('warn', `failed to read router-targets.json: ${error instanceof Error ? error.message : error}`)
    return []
  }
}

export function loadRouterSourcesFromDisk(): RouterSource[] {
  const filePath = getRouterSourcesFilePath()
  if (!existsSync(filePath)) {
    return []
  }
  try {
    const file = normalizeRouterSourcesFile(JSON.parse(readFileSync(filePath, 'utf8')) as RouterSourcesFile)
    return file.sources
  }
  catch (error) {
    routerLog('warn', `failed to read router-sources.json: ${error instanceof Error ? error.message : error}`)
    return []
  }
}

export function buildRouterBindSpecs(
  sources: RouterSource[],
  targets: RouterTarget[],
): RouterBindSpec[] {
  const byId = new Map(targets.map(target => [target.id, target]))
  const specs: RouterBindSpec[] = []
  const claimed = new Set<string>()

  for (const source of sources) {
    if (!source.enabled) {
      continue
    }
    const target = byId.get(source.targetId)
    if (!target || !target.enabled) {
      continue
    }
    for (const map of source.portMaps) {
      const key = `${map.protocol}:${map.listenPort}`
      if (claimed.has(key)) {
        routerLog('warn', `skip duplicate bind ${key} (source ${source.id})`)
        continue
      }
      claimed.add(key)
      specs.push({
        key,
        protocol: map.protocol,
        listenPort: map.listenPort,
        targetHost: target.host,
        targetPort: map.targetPort,
        sourceId: source.id,
        targetId: target.id,
      })
    }
  }
  return specs
}

function sameUpstream(a: ForwardHandle, spec: RouterBindSpec): boolean {
  return a.targetHost === spec.targetHost && a.targetPort === spec.targetPort
}

async function applyBindSpecs(specs: RouterBindSpec[]): Promise<void> {
  const desired = new Map(specs.map(spec => [spec.key, spec]))

  for (const [key, handle] of [...active.entries()]) {
    const spec = desired.get(key)
    if (!spec || !sameUpstream(handle, spec)) {
      try {
        await handle.close()
      }
      catch (error) {
        routerLog('warn', `failed to close ${key}: ${error instanceof Error ? error.message : error}`)
      }
      active.delete(key)
    }
  }

  for (const spec of specs) {
    if (active.has(spec.key)) {
      continue
    }
    try {
      if (spec.protocol === 'tcp') {
        const handle = await startTcpForward({
          listenHost,
          listenPort: spec.listenPort,
          targetHost: spec.targetHost,
          targetPort: spec.targetPort,
        })
        active.set(spec.key, handle)
      }
      else {
        const handle = await startUdpForward({
          listenHost,
          listenPort: spec.listenPort,
          targetHost: spec.targetHost,
          targetPort: spec.targetPort,
        })
        active.set(spec.key, handle)
      }
    }
    catch (error) {
      routerLog(
        'error',
        `failed to bind ${spec.key} → ${spec.targetHost}:${spec.targetPort}: ${
          error instanceof Error ? error.message : error
        }`,
      )
    }
  }
}

export function listActiveRouterBinds(): Array<{
  key: string
  protocol: 'tcp' | 'udp'
  listenPort: number
  targetHost: string
  targetPort: number
}> {
  return [...active.values()].map(handle => ({
    key: `${handle.protocol}:${handle.listenPort}`,
    protocol: handle.protocol,
    listenPort: handle.listenPort,
    targetHost: handle.targetHost,
    targetPort: handle.targetPort,
  }))
}

export async function reloadRouterRuntime(options?: {
  sources?: RouterSource[]
  targets?: RouterTarget[]
}): Promise<void> {
  const run = async () => {
    const sources = options?.sources ?? loadRouterSourcesFromDisk()
    const targets = options?.targets ?? loadRouterTargetsFromDisk()
    const specs = buildRouterBindSpecs(sources, targets)
    await applyBindSpecs(specs)
    routerLog('info', `runtime ready: ${active.size} bind(s)`)
  }
  reloadChain = reloadChain.then(run, run)
  await reloadChain
}

export async function stopRouterRuntime(): Promise<void> {
  reloadChain = reloadChain.then(async () => {
    for (const [key, handle] of [...active.entries()]) {
      try {
        await handle.close()
      }
      catch (error) {
        routerLog('warn', `failed to close ${key}: ${error instanceof Error ? error.message : error}`)
      }
      active.delete(key)
    }
  })
  await reloadChain
}
