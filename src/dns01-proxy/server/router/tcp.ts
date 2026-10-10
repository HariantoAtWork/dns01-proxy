import { connect, createServer, type Server, type Socket } from 'node:net'
import { routerLog } from './log'

export type TcpForwardHandle = {
  protocol: 'tcp'
  listenPort: number
  targetHost: string
  targetPort: number
  close: () => Promise<void>
}

function pipeSockets(client: Socket, upstream: Socket): void {
  client.pipe(upstream)
  upstream.pipe(client)
  const destroyBoth = () => {
    client.destroy()
    upstream.destroy()
  }
  client.on('error', destroyBoth)
  upstream.on('error', destroyBoth)
  client.on('close', () => {
    upstream.destroy()
  })
  upstream.on('close', () => {
    client.destroy()
  })
}

export function startTcpForward(options: {
  listenHost: string
  listenPort: number
  targetHost: string
  targetPort: number
}): Promise<TcpForwardHandle> {
  const { listenHost, listenPort, targetHost, targetPort } = options

  return new Promise((resolve, reject) => {
    const server: Server = createServer((client) => {
      const upstream = connect({ port: targetPort, host: targetHost }, () => {
        pipeSockets(client, upstream)
      })
      upstream.on('error', (error) => {
        routerLog('warn', `tcp ${listenPort}→${targetHost}:${targetPort} upstream error: ${error.message}`)
        client.destroy()
      })
      client.on('error', () => {
        upstream.destroy()
      })
    })

    server.once('error', reject)
    server.listen(listenPort, listenHost, () => {
      routerLog('info', `tcp listen ${listenHost}:${listenPort} → ${targetHost}:${targetPort}`)
      resolve({
        protocol: 'tcp',
        listenPort,
        targetHost,
        targetPort,
        close: () => new Promise((res, rej) => {
          server.close((error) => {
            if (error) {
              rej(error)
              return
            }
            res()
          })
        }),
      })
    })
  })
}
