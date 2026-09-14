import type { ProxyHost } from '../../plugins/proxy/runtime/shared/types/proxyHost'
import { probeProxyHostHealth } from '../../plugins/proxy/runtime/server/utils/proxyHostHealth'

export type PublicLiveStatus = {
  online: boolean
  latencyMs?: number
  at: string
}

const SSE_INTERVAL_MS = 5_000

export async function probePublicLiveStatus(host: ProxyHost): Promise<PublicLiveStatus> {
  const result = await probeProxyHostHealth({
    forwardScheme: host.forwardScheme,
    forwardHost: host.forwardHost,
    forwardPort: host.forwardPort,
  })
  return {
    online: result.online,
    ...(result.online ? { latencyMs: result.latencyMs } : {}),
    at: new Date().toISOString(),
  }
}

function prefersEventStream(accept: string | null): boolean {
  if (!accept) {
    return false
  }
  return accept.toLowerCase().includes('text/event-stream')
}

function prefersJson(accept: string | null): boolean {
  if (!accept) {
    return false
  }
  const lower = accept.toLowerCase()
  // Prefer JSON when explicitly requested and not beaten by HTML for browsers.
  if (lower.includes('application/json')) {
    return true
  }
  return false
}

function liveStatusHtml(initial: PublicLiveStatus): string {
  const initialJson = JSON.stringify(initial).replace(/</g, '\\u003c')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Upstream status</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: ui-sans-serif, system-ui, sans-serif;
      background: #0f1115; color: #e8eaed;
    }
    main { text-align: center; padding: 2rem; }
    .dot {
      width: 4rem; height: 4rem; border-radius: 9999px; margin: 0 auto 1rem;
      background: #6b7280; box-shadow: 0 0 0 0 rgba(107,114,128,.4);
      transition: background .2s ease;
    }
    .dot.online { background: #22c55e; box-shadow: 0 0 0 8px rgba(34,197,94,.15); }
    .dot.offline { background: #ef4444; box-shadow: 0 0 0 8px rgba(239,68,68,.12); }
    h1 { font-size: 1.25rem; font-weight: 600; margin: 0 0 .5rem; }
    p { margin: 0; color: #9aa0a6; font-size: .875rem; }
    .meta { margin-top: .75rem; font-variant-numeric: tabular-nums; }
  </style>
</head>
<body>
  <main>
    <div id="dot" class="dot" aria-hidden="true"></div>
    <h1 id="label">Checking…</h1>
    <p id="meta" class="meta"></p>
  </main>
  <script>
    const initial = ${initialJson};
    const dot = document.getElementById('dot');
    const label = document.getElementById('label');
    const meta = document.getElementById('meta');
    let pollTimer = null;
    let source = null;

    function render(status) {
      const online = Boolean(status && status.online);
      dot.className = 'dot ' + (online ? 'online' : 'offline');
      label.textContent = online ? 'Upstream online' : 'Upstream offline';
      const parts = [];
      if (online && typeof status.latencyMs === 'number') {
        parts.push(status.latencyMs + ' ms');
      }
      if (status && status.at) {
        parts.push(status.at);
      }
      meta.textContent = parts.join(' · ');
    }

    async function pollOnce() {
      try {
        const res = await fetch('/', { headers: { Accept: 'application/json' }, cache: 'no-store' });
        if (!res.ok) throw new Error('poll failed');
        render(await res.json());
      } catch (_) {
        render({ online: false, at: new Date().toISOString() });
      }
    }

    function startPolling() {
      if (pollTimer) return;
      if (source) {
        try { source.close(); } catch (_) {}
        source = null;
      }
      void pollOnce();
      pollTimer = setInterval(pollOnce, 5000);
    }

    function startSse() {
      if (typeof EventSource === 'undefined') {
        startPolling();
        return;
      }
      try {
        source = new EventSource('/');
        source.onmessage = (event) => {
          try { render(JSON.parse(event.data)); } catch (_) {}
        };
        source.onerror = () => { startPolling(); };
      } catch (_) {
        startPolling();
      }
    }

    render(initial);
    startSse();
  </script>
</body>
</html>`
}

/**
 * Content-negotiated public live status for unauthenticated GET /.
 */
export async function respondPublicLiveStatus(
  req: Request,
  host: ProxyHost,
): Promise<Response> {
  const accept = req.headers.get('accept')

  if (prefersEventStream(accept)) {
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        let closed = false

        const send = async () => {
          if (closed) {
            return
          }
          try {
            const status = await probePublicLiveStatus(host)
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(status)}\n\n`),
            )
          }
          catch {
            if (!closed) {
              const fallback: PublicLiveStatus = {
                online: false,
                at: new Date().toISOString(),
              }
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(fallback)}\n\n`),
              )
            }
          }
        }

        await send()
        const timer = setInterval(() => {
          void send()
        }, SSE_INTERVAL_MS)

        const abort = () => {
          if (closed) {
            return
          }
          closed = true
          clearInterval(timer)
          try {
            controller.close()
          }
          catch {
            // already closed
          }
        }

        req.signal.addEventListener('abort', abort)
      },
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      },
    })
  }

  const status = await probePublicLiveStatus(host)

  if (prefersJson(accept)) {
    return Response.json(status, {
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  return new Response(liveStatusHtml(status), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
