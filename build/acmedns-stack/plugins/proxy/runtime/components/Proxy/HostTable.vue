<script setup lang="ts">
import type { ProxyHost } from '#proxy-shared/types/proxyHost'
import { forwardTarget } from '#proxy-shared/utils/proxyHost'
import {
  PhPencilSimple as Pencil,
  PhTrash as Trash,
  PhCode as Code,
} from '@phosphor-icons/vue'

const { hosts } = defineProps<{
  hosts: ProxyHost[]
}>()

const emit = defineEmits<{
  edit: [host: ProxyHost]
  remove: [host: ProxyHost]
  export: [host: ProxyHost]
}>()
</script>

<template>
  <div class="overflow-x-auto rounded-[var(--radius-panel)] border border-rule">
    <table class="min-w-full text-left text-sm">
      <thead class="border-b border-rule bg-panel text-xs uppercase tracking-wide text-muted">
        <tr>
          <th class="px-3 py-2 font-medium">Source</th>
          <th class="px-3 py-2 font-medium">Forward</th>
          <th class="px-3 py-2 font-medium">SSL</th>
          <th class="px-3 py-2 font-medium">Flags</th>
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
              <span
                v-for="name in host.domainNames"
                :key="name"
                class="font-mono text-sm"
              >{{ name }}</span>
              <span
                v-if="!host.enabled"
                class="text-xs text-muted"
              >Disabled</span>
            </div>
          </td>
          <td class="px-3 py-2 font-mono text-xs text-muted">
            {{ forwardTarget(host) }}
          </td>
          <td class="px-3 py-2 text-muted">
            {{ host.certificateName || 'None' }}
          </td>
          <td class="px-3 py-2">
            <div class="flex flex-wrap gap-1">
              <span
                v-if="host.allowWebsocketUpgrade"
                class="rounded border border-rule px-1.5 py-0.5 text-[11px] text-muted"
              >WS</span>
              <span
                v-if="host.blockExploits"
                class="rounded border border-rule px-1.5 py-0.5 text-[11px] text-muted"
              >Block</span>
              <span
                v-if="host.sslForced"
                class="rounded border border-rule px-1.5 py-0.5 text-[11px] text-muted"
              >Force SSL</span>
            </div>
          </td>
          <td class="px-3 py-2">
            <div class="flex justify-end gap-1">
              <UiButton
                variant="icon"
                size="sm"
                aria-label="Export nginx"
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
