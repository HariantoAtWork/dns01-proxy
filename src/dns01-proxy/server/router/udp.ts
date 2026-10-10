import { createSocket, type RemoteInfo, type Socket } from 'node:dgram'
import { routerLog } from './log'

export type UdpForwardHandle = {
  protocol: 'udp'
  listenPort: number
  targetHost: string
  targetPort: number
  close: () => Promise<void>
  /** Active client sessions (for tests / status). */
  sessionCount: () => number
}

type UdpSession = {
  upstream: Socket
  clientAddress: string
  clientPort: number
  lastActive: number
}

const DEFAULT_IDLE_MS = 60_000
const SWEEP_MS = 10_000

function sessionKey(address: string, port: number): string {
  return `${address}:${port}`
}

export function startUdpForward(options: {
  listenHost: string
  listenPort: number
  targetHost: string
  targetPort: number
  idleMs?: number
}): Promise<UdpForwardHandle> {
  const {
    listenHost,
    listenPort,
    targetHost,
    targetPort,
    idleMs = DEFAULT_IDLE_MS,
  } = options

  return new Promise((resolve, reject) => {
    const listenSocket = createSocket('udp4')
    const sessions = new Map<string, UdpSession>()
    let closed = false
    let sweepTimer: ReturnType<typeof setInterval> | null = null

    function destroySession(key: string): void {
      const session = sessions.get(key)
      if (!session) {
        return
      }
      sessions.delete(key)
      try {
        session.upstream.close()
      }
      catch {
        // ignore
      }
    }

    function sweep(): void {
      const now = Date.now()
      for (const [key, session] of sessions) {
        if (now - session.lastActive > idleMs) {
          destroySession(key)
        }
      }
    }

    function ensureSession(rinfo: RemoteInfo): UdpSession {
      const key = sessionKey(rinfo.address, rinfo.port)
      const existing = sessions.get(key)
      if (existing) {
        existing.lastActive = Date.now()
        return existing
      }

      const upstream = createSocket('udp4')
      const session: UdpSession = {
        upstream,
        clientAddress: rinfo.address,
        clientPort: rinfo.port,
        lastActive: Date.now(),
      }
      sessions.set(key, session)

      upstream.on('message', (msg) => {
        session.lastActive = Date.now()
        listenSocket.send(msg, session.clientPort, session.clientAddress, (error) => {
          if (error) {
            routerLog('warn', `udp ${listenPort} reply to ${key} failed: ${error.message}`)
          }
        })
      })
      upstream.on('error', (error) => {
        routerLog('warn', `udp ${listenPort}→${targetHost}:${targetPort} session ${key}: ${error.message}`)
        destroySession(key)
      })

      return session
    }

    listenSocket.on('message', (msg, rinfo) => {
      const session = ensureSession(rinfo)
      session.upstream.send(msg, targetPort, targetHost, (error) => {
        if (error) {
          routerLog('warn', `udp ${listenPort}→${targetHost}:${targetPort} send failed: ${error.message}`)
        }
      })
    })

    listenSocket.once('error', reject)
    listenSocket.bind(listenPort, listenHost, () => {
      sweepTimer = setInterval(sweep, SWEEP_MS)
      if (typeof sweepTimer === 'object' && 'unref' in sweepTimer) {
        sweepTimer.unref()
      }
      routerLog('info', `udp listen ${listenHost}:${listenPort} → ${targetHost}:${targetPort}`)
      resolve({
        protocol: 'udp',
        listenPort,
        targetHost,
        targetPort,
        sessionCount: () => sessions.size,
        close: () => new Promise((res) => {
          if (closed) {
            res()
            return
          }
          closed = true
          if (sweepTimer) {
            clearInterval(sweepTimer)
            sweepTimer = null
          }
          for (const key of [...sessions.keys()]) {
            destroySession(key)
          }
          listenSocket.close(() => res())
        }),
      })
    })
  })
}

/** Exposed for unit tests. */
export const __udpTest = { DEFAULT_IDLE_MS, sessionKey }
