<script setup lang="ts">
import type { ProxyHost } from '#proxy-shared/types/proxyHost'
import type { ProxyCertCandidate } from '#proxy-shared/utils/proxyCertMatch'
import {
  proxyHostSslAvailability,
  proxySslAvailabilityClass,
  proxySslAvailabilityLabel,
  proxySslCertLabel,
} from '#proxy-shared/utils/proxyCertMatch'
import { forwardTarget, isWildcardDomainName } from '#proxy-shared/utils/proxyHost'
import {
  PhCircle as Circle,
  PhPencilSimple as Pencil,
  PhTrash as Trash,
} from '@phosphor-icons/vue'

type HostHealth = {
  online: boolean
  latencyMs?: number
  error?: string
}

type RemoteDomainHealth = {
  online: boolean
  latencyMs?: number
  status?: number
  target?: string
  error?: string
}

const {
  hosts,
  healthById = {},
  remoteHealthById = {},
  certEntries = [],
  togglingId = null,
} = defineProps<{
  hosts: ProxyHost[]
  healthById?: Record<string, HostHealth>
  remoteHealthById?: Record<string, Record<string, RemoteDomainHealth>>
  certEntries?: ProxyCertCandidate[]
  togglingId?: string | null
}>()

const emit = defineEmits<{
  edit: [host: ProxyHost]
  remove: [host: ProxyHost]
  'toggle-enabled': [host: ProxyHost, enabled: boolean]
}>()

function statusLabel(host: ProxyHost): string {
  if (!host.enabled) {
    return 'Off'
  }
  const health = healthById[host.id]
  if (!health) {
    return '…'
  }
  return health.online ? 'Online' : 'Offline'
}

function statusDetail(host: ProxyHost): string {
  const health = healthById[host.id]
  if (!health || health.online || !health.error) {
    return ''
  }
  const error = health.error
  if (/ENOTFOUND/i.test(error)) {
    return 'DNS: hostname not on this Docker network'
  }
  if (/ECONNREFUSED/i.test(error)) {
    return 'connection refused'
  }
  if (/timeout/i.test(error)) {
    return 'timeout'
  }
  return error.length > 48 ? `${error.slice(0, 45)}…` : error
}

function statusClass(host: ProxyHost): string {
  if (!host.enabled) {
    return 'text-muted'
  }
  const health = healthById[host.id]
  if (!health) {
    return 'text-muted'
  }
  return health.online ? 'text-live' : 'text-danger'
}

function sslAvailability(host: ProxyHost) {
  return proxyHostSslAvailability(host.certificateName, host.domainNames, certEntries)
}

function sslCertLabel(host: ProxyHost) {
  return proxySslCertLabel(host.certificateName, host.domainNames, certEntries)
}

/** Public URL for an exact domain; wildcards stay plain text. */
function domainHref(host: ProxyHost, name: string): string | null {
  if (isWildcardDomainName(name)) {
    return null
  }
  const scheme = host.certificateName ? 'https' : 'http'
  return `${scheme}://${name}`
}

function domainEntries(host: ProxyHost) {
  return host.domainNames.map(name => ({
    name,
    href: domainHref(host, name),
  }))
}

function remoteLedClass(host: ProxyHost, domain: string): string {
  if (!host.enabled || isWildcardDomainName(domain)) {
    return 'text-muted'
  }
  const byHost = remoteHealthById[host.id]
  if (!byHost || !(domain in byHost)) {
    return 'text-muted animate-pulse'
  }
  return byHost[domain]?.online ? 'text-live' : 'text-danger'
}

function remoteLedTitle(host: ProxyHost, domain: string): string {
  if (!host.enabled) {
    return 'Off'
  }
  if (isWildcardDomainName(domain)) {
    return 'Wildcard — not probed'
  }
  const byHost = remoteHealthById[host.id]
  if (!byHost || !(domain in byHost)) {
    return 'Checking…'
  }
  const health = byHost[domain]
  if (!health) {
    return 'Checking…'
  }
  if (health.online) {
    const ms = health.latencyMs != null ? ` (${health.latencyMs}ms)` : ''
    return `Online${ms}`
  }
  return health.error ? `Offline — ${health.error}` : 'Offline'
}

function onEnabledChange(host: ProxyHost, event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  emit('toggle-enabled', host, checked)
}
</script>

<template>
  <div class="overflow-x-auto rounded-[var(--radius-panel)] border border-rule">
    <table class="min-w-full text-left text-sm">
      <thead class="border-b border-rule bg-panel text-xs uppercase tracking-wide text-muted">
        <tr>
          <th class="px-3 py-2 font-medium">Source</th>
          <th class="px-3 py-2 font-medium">Forward</th>
          <th class="px-3 py-2 font-medium">SSL availability</th>
          <th class="px-3 py-2 font-medium">Flags</th>
          <th class="px-3 py-2 font-medium">Enabled</th>
          <th class="px-3 py-2 font-medium">Status</th>
          <th class="px-3 py-2 font-medium text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="host in hosts"
          :key="host.id"
          class="border-b border-rule last:border-0 hover:bg-panel/60"
        >
          <td class="px-3 py-2 font-medium text-ink">
            <div class="flex flex-col gap-0.5">
              <div
                v-for="entry in domainEntries(host)"
                :key="entry.name"
                class="flex items-center gap-1.5"
              >
                <Circle
                  :size="8"
                  weight="fill"
                  aria-hidden="true"
                  :class="remoteLedClass(host, entry.name)"
                  :title="remoteLedTitle(host, entry.name)"
                />
                <a
                  v-if="entry.href"
                  :href="entry.href"
                  class="font-mono text-sm text-signal underline-offset-2 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >{{ entry.name }}</a>
                <span
                  v-else
                  class="font-mono text-sm"
                >{{ entry.name }}</span>
              </div>
            </div>
          </td>
          <td class="px-3 py-2 font-mono text-xs text-muted">
            {{ forwardTarget(host) }}
          </td>
          <td class="px-3 py-2">
            <div class="flex flex-col gap-0.5">
              <span
                class="text-xs font-medium"
                :class="proxySslAvailabilityClass(sslAvailability(host))"
              >
                {{ proxySslAvailabilityLabel(sslAvailability(host)) }}
              </span>
              <span class="font-mono text-[11px] text-muted">
                {{ sslCertLabel(host) }}
              </span>
            </div>
          </td>
          <td class="px-3 py-2">
            <div class="flex flex-wrap gap-1">
              <span
                v-if="host.certificateName"
                class="rounded border border-rule px-1.5 py-0.5 text-[11px] text-muted"
              >SSL</span>
              <span
                v-if="host.sslForced"
                class="rounded border border-rule px-1.5 py-0.5 text-[11px] text-muted"
              >Force SSL</span>
              <span
                v-if="host.allowWebsocketUpgrade"
                class="rounded border border-rule px-1.5 py-0.5 text-[11px] text-muted"
              >WS</span>
              <span
                v-if="host.accessListId"
                class="rounded border border-rule px-1.5 py-0.5 text-[11px] text-muted"
                title="Bound Access List (IP / Basic Auth)"
              >Access</span>
              <span
                v-if="host.bearerListId"
                class="rounded border border-rule px-1.5 py-0.5 text-[11px] text-muted"
                title="Requires Authorization: Bearer"
              >Bearer</span>
            </div>
          </td>
          <td class="px-3 py-2">
            <input
              type="checkbox"
              class="size-4"
              :checked="host.enabled"
              :disabled="togglingId === host.id"
              :aria-label="`Enable ${host.domainNames[0] || host.id}`"
              @change="onEnabledChange(host, $event)"
            >
          </td>
          <td
            class="px-3 py-2 text-xs font-medium"
            :class="statusClass(host)"
          >
            <div>{{ statusLabel(host) }}
              <span
                v-if="healthById[host.id]?.online && healthById[host.id]?.latencyMs != null"
                class="ml-1 font-normal text-muted"
              >{{ healthById[host.id]?.latencyMs }}ms</span>
            </div>
            <p
              v-if="statusDetail(host)"
              class="mt-0.5 max-w-[16rem] font-normal text-muted"
              :title="healthById[host.id]?.error"
            >
              {{ statusDetail(host) }}
            </p>
          </td>
          <td class="px-3 py-2">
            <div class="flex justify-end gap-1">
              <UiButton
                variant="icon"
                size="sm"
                aria-label="Edit"
                @click="emit('edit', host)"
              >
                <Pencil :size="14" weight="regular" aria-hidden="true" />
              </UiButton>
              <UiButton
                variant="icon"
                size="sm"
                aria-label="Delete"
                @click="emit('remove', host)"
              >
                <Trash :size="14" weight="regular" aria-hidden="true" />
              </UiButton>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
