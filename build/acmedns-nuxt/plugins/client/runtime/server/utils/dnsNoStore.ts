import type { H3Event } from 'h3'

export function setDnsNoStore(event: H3Event) {
  setHeader(event, 'Cache-Control', 'no-store')
}
