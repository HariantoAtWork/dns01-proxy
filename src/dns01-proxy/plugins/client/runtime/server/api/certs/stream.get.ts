import { subscribeCertLive } from '../../utils/certLiveBus'
import { buildCertLiveSnapshot } from '../../utils/certLivePublish'

export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream({
    start(controller) {
      const send = (name: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`),
          )
        }
        catch {
          // Client disconnected.
        }
      }

      // SSE comment helps some proxies flush the stream immediately.
      controller.enqueue(encoder.encode(': connected\n\n'))
      send('snapshot', buildCertLiveSnapshot())
      send('ping', {})

      unsubscribe = subscribeCertLive((liveEvent) => {
        send(liveEvent.type, liveEvent.data)
      })

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'))
        }
        catch {
          // Client disconnected.
        }
        send('ping', {})
      }, 10_000)
    },
    cancel() {
      if (heartbeat) {
        clearInterval(heartbeat)
      }
      unsubscribe?.()
    },
  })

  return sendStream(event, stream)
})
