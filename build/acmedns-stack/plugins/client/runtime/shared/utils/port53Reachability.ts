export type Port53ProbeStatus = 'ok' | 'timeout' | 'wrong_zone' | 'no_data'

export interface Port53Probe {
  target: string
  label: string
  status: Port53ProbeStatus
  message: string
}

export interface Port53DelegationCheck {
  nameservers: string[]
  addresses: string[]
  matchesHostIp: boolean
  probes: Port53Probe[]
}

export type Port53ReachabilitySummary = 'ok' | 'partial' | 'failed' | 'unknown'

export interface Port53Reachability {
  authZone: string
  local: Port53Probe | null
  /** Echo-detected host public IP(s) — each probe is UDP then TCP fallback. */
  hostPublic: Port53Probe[]
  /** Glue A/AAAA and env-pinned addresses — informational only. */
  configured: Port53Probe[]
  delegation: Port53DelegationCheck | null
  summary: Port53ReachabilitySummary
  hint?: string
}

export function port53ProbeFromLookup(
  lookup: 'ok' | 'nxdomain' | 'nodata' | 'timeout',
  target: string,
  label: string,
  transport: 'udp' | 'tcp' = 'udp',
): Port53Probe {
  const port = transport === 'tcp' ? 'TCP 53' : 'UDP 53'

  if (lookup === 'ok') {
    return {
      target,
      label,
      status: 'ok',
      message: `${port} answered for the auth zone`,
    }
  }

  if (lookup === 'nxdomain') {
    return {
      target,
      label,
      status: 'wrong_zone',
      message: `NXDOMAIN over ${port} — another DNS server may own this address`,
    }
  }

  if (lookup === 'nodata') {
    return {
      target,
      label,
      status: 'no_data',
      message: `${port} answered but not for the auth zone`,
    }
  }

  return {
    target,
    label,
    status: 'timeout',
    message: transport === 'tcp'
      ? 'No TCP 53 response (timeout, filtered, or Docker hairpin blocked)'
      : 'No UDP 53 response (timeout, filtered, or NAT hairpin blocked)',
  }
}

function anyOk(probes: Port53Probe[]) {
  return probes.some(probe => probe.status === 'ok')
}

function allTimeouts(probes: Port53Probe[]) {
  return probes.length > 0 && probes.every(probe => probe.status === 'timeout')
}

export function summarizePort53Reachability(input: {
  authZone: string
  local: Port53Probe | null
  hostPublic: Port53Probe[]
  configured: Port53Probe[]
  delegation: Port53DelegationCheck | null
}): Port53Reachability {
  const hostPublicOk = anyOk(input.hostPublic)
  const configuredOk = anyOk(input.configured)
  const delegationOk = input.delegation ? anyOk(input.delegation.probes) : false
  const localOk = input.local?.status === 'ok'
  const hostPublicTimedOut = allTimeouts(input.hostPublic)
  const delegationTimedOut = Boolean(
    input.delegation?.probes.length && allTimeouts(input.delegation.probes),
  )

  let summary: Port53ReachabilitySummary = 'unknown'
  let hint: string | undefined

  // Green when a public/self IP answers on port 53 for the auth zone (UDP, or TCP after UDP timeout).
  if (hostPublicOk) {
    summary = 'ok'
  }
  else if (configuredOk && !input.hostPublic.length) {
    summary = 'ok'
    hint = 'Glue or configured IP answers on port 53. No echo public IP was detected from this container.'
  }
  else if (!input.hostPublic.length && !input.configured.length && !input.delegation?.addresses.length) {
    summary = localOk ? 'partial' : 'unknown'
    hint = localOk
      ? 'DNS listens locally but no public IP was detected to probe on port 53.'
      : 'Detect a public IP first, then confirm port 53 is forwarded to this host.'
  }
  else if (input.hostPublic.length) {
    // From inside the container, probing the WAN IP often times out (Docker hairpin)
    // even when Let's Encrypt and external dig succeed. Do not paint that red.
    const likelyHairpin = localOk && hostPublicTimedOut && (
      !input.delegation?.probes.length
      || delegationOk
      || delegationTimedOut
    )

    if (likelyHairpin) {
      summary = 'partial'
      hint = 'DNS answers locally, but probes to your public IP timed out from this container — Docker/NAT hairpin is common. Confirm from outside with dig; Let\'s Encrypt checks from the internet.'

      if (delegationOk && input.delegation && !input.delegation.matchesHostIp) {
        hint = [
          hint,
          `Public delegation NS resolves to ${input.delegation.addresses.join(', ')} — not your echo IP; worth checking glue.`,
        ].join(' ')
      }
    }
    else {
      summary = 'failed'
      hint = 'Port 53 on your detected public IP did not answer from here. Check router DMZ/NAT and that port 53 is forwarded to this host.'

      if (input.hostPublic.some(probe => probe.status === 'wrong_zone')) {
        hint = 'Port 53 answered on the public IP, but not with this auth zone — another DNS server may own that address.'
      }
      else if (localOk) {
        hint = [
          hint,
          'DNS listens on this container but the public IP check failed for a reason other than a plain timeout.',
        ].join(' ')
      }
    }
  }
  else {
    summary = localOk ? 'partial' : 'failed'
    hint = 'Port 53 is not answering on the glue or delegated address(es). Let\'s Encrypt DNS-01 needs UDP (and ideally TCP) 53 on the published glue IP.'
  }

  if (
    summary === 'ok'
    && input.delegation
    && input.delegation.addresses.length
    && !input.delegation.matchesHostIp
    && input.hostPublic.length
  ) {
    hint = [
      hint,
      'Public delegation NS resolves to different IP(s) than this host\'s echo address — worth checking glue at the registrar.',
    ].filter(Boolean).join(' ')
  }

  return {
    authZone: input.authZone,
    local: input.local,
    hostPublic: input.hostPublic,
    configured: input.configured,
    delegation: input.delegation,
    summary,
    hint,
  }
}

export function port53StatusLabel(status: Port53ProbeStatus) {
  switch (status) {
    case 'ok':
      return 'Reachable'
    case 'timeout':
      return 'Unreachable'
    case 'wrong_zone':
      return 'Wrong server'
    case 'no_data':
      return 'No zone data'
    default:
      return status
  }
}

export function port53SummaryLabel(summary: Port53ReachabilitySummary) {
  switch (summary) {
    case 'ok':
      return 'Port 53 reachable for DNS-01'
    case 'partial':
      return 'Port 53 unconfirmed from this host'
    case 'failed':
      return 'Port 53 not reachable for DNS-01'
    default:
      return 'Port 53 unknown'
  }
}

export type Port53SummaryTone = 'ok' | 'warn' | 'bad' | 'muted'

export function port53SummaryTone(summary: Port53ReachabilitySummary | undefined): Port53SummaryTone {
  switch (summary) {
    case 'ok':
      return 'ok'
    case 'partial':
      return 'warn'
    case 'failed':
      return 'bad'
    default:
      return 'muted'
  }
}

export function port53ToneTextClass(tone: Port53SummaryTone) {
  switch (tone) {
    case 'ok':
      return 'text-live'
    case 'warn':
      return 'text-signal'
    case 'bad':
      return 'text-danger'
    default:
      return 'text-muted'
  }
}

export function port53ToneBarClass(tone: Port53SummaryTone) {
  switch (tone) {
    case 'ok':
      return 'border-live/35 bg-live/[0.06]'
    case 'warn':
      return 'border-signal/35 bg-signal/[0.06]'
    case 'bad':
      return 'border-danger/35 bg-danger/[0.06]'
    default:
      return 'border-rule bg-panel'
  }
}
