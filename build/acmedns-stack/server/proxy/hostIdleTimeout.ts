import type { Server } from 'bun'

/**
 * Apply a proxy host's optional idleTimeout override via Bun's per-request API.
 * No-op when unset/`null` so the edge `Bun.serve({ idleTimeout })` default applies.
 *
 * @see https://bun.com/docs/runtime/http/server#server-timeout-request-seconds
 */
export function applyProxyHostIdleTimeout(
  server: Pick<Server, 'timeout'>,
  req: Request,
  host: { idleTimeout?: number | null },
): void {
  if (host.idleTimeout == null) {
    return
  }
  server.timeout(req, host.idleTimeout)
}
