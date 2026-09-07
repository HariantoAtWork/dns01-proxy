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
  PhPencilSimple as Pencil,
  PhTrash as Trash,
  PhCode as Code,
} from '@phosphor-icons/vue'

type HostHealth = {
  online: boolean
  latencyMs?: number
}

const { hosts, healthById = {}, certEntries = [] } = defineProps<{
  hosts: ProxyHost[]
  healthById?: Record<string, HostHealth>
  certEntries?: ProxyCertCandidate[]
}>()

const emit = defineEmits<{
  edit: [host: ProxyHost]
  remove: [host: ProxyHost]
  export: [host: ProxyHost]
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

function statusClass(host: ProxyHost): string {
  if (!host.enabled) {
    return 'text-muted'
  }
  const health = healthById[host.id]
  if (!health) {
    return 'text-muted'
  }
  return health.online ? 'text-signal' : 'text-danger'
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
              <template
                v-for="entry in domainEntries(host)"
                :key="entry.name"
              >
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
              </template>
              <span
                v-if="!host.enabled"
                class="text-xs text-muted"
              >Disabled</span>
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
                v-if="host.blockExploits"
                class="rounded border border-rule px-1.5 py-0.5 text-[11px] text-muted"
              >Block</span>
            </div>
          </td>
          <td
            class="px-3 py-2 text-xs font-medium"
            :class="statusClass(host)"
          >
            {{ statusLabel(host) }}
            <span
              v-if="healthById[host.id]?.online && healthById[host.id]?.latencyMs != null"
              class="ml-1 font-normal text-muted"
            >{{ healthById[host.id]?.latencyMs }}ms</span>
          </td>
          <td class="px-3 py-2">
            <div class="flex justify-end gap-1">
              <UiButton
                variant="icon"
                size="sm"
                aria-label="Export nginx snippet"
                title="Export nginx snippet (reference)"
                @click="emit('export', host)"
              >
                <Code :size="14" weight="regular" aria-hidden="true" />
              </UiButton>
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
