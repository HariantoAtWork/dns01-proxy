/**
 * When true (`ACME_TXT_ONLINE_TCP_FALLBACK=1|true|yes|on`), TXT online probes
 * fall back to TCP/53 after a UDP timeout (and allow truncated-TXT TCP retry).
 * Default off — UDP only, closer to Let's Encrypt’s usual first probe.
 */
export function acmeTxtOnlineTcpFallback(): boolean {
  const raw = (process.env.ACME_TXT_ONLINE_TCP_FALLBACK || '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}
