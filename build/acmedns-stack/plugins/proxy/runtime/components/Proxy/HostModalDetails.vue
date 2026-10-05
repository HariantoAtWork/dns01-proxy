<script setup lang="ts">
import type { ForwardScheme, ProxyHostInput } from '#proxy-shared/types/proxyHost'

const domainsText = defineModel<string>('domainsText', { required: true })

const {
  draft,
  portPlaceholder,
  duplicateWarning = null,
  accessLists = [],
  bearerLists = [],
  pasteForwardTarget,
  blurHostForward,
} = defineProps<{
  draft: ProxyHostInput
  portPlaceholder: string
  duplicateWarning?: string | null
  accessLists?: Array<{ id: string, name: string }>
  bearerLists?: Array<{ id: string, name: string }>
  pasteForwardTarget: (
    target: { forwardScheme: ForwardScheme, forwardHost: string, forwardPort: number },
    event: ClipboardEvent,
  ) => void
  blurHostForward: () => void
}>()

const detailsInfoOpen = reactive({
  domains: false,
  enabled: false,
  websockets: false,
})

function resetDetailsInfoOpen() {
  detailsInfoOpen.domains = false
  detailsInfoOpen.enabled = false
  detailsInfoOpen.websockets = false
}

defineExpose({ resetDetailsInfoOpen })
</script>

<template>
  <div
    class="flex min-h-[14rem] flex-col gap-4"
    role="tabpanel"
  >
    <UiField
      v-model:info-open="detailsInfoOpen.domains"
      label="Domain Names"
      info="One per line or comma-separated. Wildcards like *.example.com match one label. Each domain can only belong to one proxy host."
    >
      <template #default="{ id }">
        <textarea
          :id
          v-model="domainsText"
          rows="3"
          class="ui-input w-full border border-rule bg-paper px-3 py-2 font-mono text-sm"
          style="border-radius: var(--radius-input)"
          :aria-invalid="Boolean(duplicateWarning)"
        />
      </template>
    </UiField>

    <div class="grid gap-3 sm:grid-cols-3">
      <UiField label="Scheme">
        <template #default="{ id }">
          <select
            :id
            v-model="draft.forwardScheme"
            class="ui-input w-full border border-rule bg-paper px-3 py-2 text-sm"
            style="border-radius: var(--radius-input)"
          >
            <option value="http">
              http
            </option>
            <option value="https">
              https
            </option>
          </select>
        </template>
      </UiField>
      <UiField label="Forward Hostname / IP">
        <template #default="{ id }">
          <UiInput
            :id
            v-model="draft.forwardHost"
            mono
            @paste="pasteForwardTarget(draft, $event)"
            @blur="blurHostForward"
          />
        </template>
      </UiField>
      <UiField label="Forward Port" :hint="`empty → ${portPlaceholder}`">
        <template #default="{ id }">
          <input
            :id
            v-model.number="draft.forwardPort"
            type="number"
            min="1"
            max="65535"
            :placeholder="portPlaceholder"
            class="ui-input w-full border border-rule bg-paper px-3 py-2 font-mono text-sm"
            style="border-radius: var(--radius-input)"
            @paste="pasteForwardTarget(draft, $event)"
          >
        </template>
      </UiField>
    </div>

    <div class="flex flex-col gap-2 rounded-[var(--radius-panel)] border border-rule p-3">
      <UiInfoDrawer
        v-model="detailsInfoOpen.enabled"
        label="About Enabled"
      >
        <template #title>
          <span>Enabled</span>
        </template>
        <template #action>
          <input
            v-model="draft.enabled"
            type="checkbox"
            class="size-4"
            aria-label="Enabled"
          >
        </template>
        <template #info>
          When off, the edge proxy ignores this host — no routing until you turn it back on.
        </template>
      </UiInfoDrawer>
      <UiInfoDrawer
        v-model="detailsInfoOpen.websockets"
        label="About Websockets Support"
      >
        <template #title>
          <span>Websockets Support</span>
        </template>
        <template #action>
          <input
            v-model="draft.allowWebsocketUpgrade"
            type="checkbox"
            class="size-4"
            aria-label="Websockets Support"
          >
        </template>
        <template #info>
          Allow WebSocket upgrades through to the upstream (Upgrade / Connection headers). Leave off for plain HTTP only.
        </template>
      </UiInfoDrawer>
    </div>

    <UiField
      label="Access List"
      hint="Gate by IP / Basic Auth — manage lists under Access Lists"
    >
      <template #default="{ id }">
        <select
          :id
          class="ui-input w-full border border-rule bg-paper px-3 py-2 text-sm"
          style="border-radius: var(--radius-input)"
          :value="draft.accessListId || ''"
          @change="draft.accessListId = ($event.target as HTMLSelectElement).value || null"
        >
          <option value="">
            Publicly Accessible
          </option>
          <option
            v-for="list in accessLists"
            :key="list.id"
            :value="list.id"
          >
            {{ list.name }}
          </option>
        </select>
      </template>
    </UiField>

    <UiField
      label="Bearer List"
      hint="Require Authorization: Bearer matching any key in the list — manage under Bearer Lists. Unauthenticated GET / shows upstream live status."
    >
      <template #default="{ id }">
        <select
          :id
          class="ui-input w-full border border-rule bg-paper px-3 py-2 text-sm"
          style="border-radius: var(--radius-input)"
          :value="draft.bearerListId || ''"
          @change="draft.bearerListId = ($event.target as HTMLSelectElement).value || null"
        >
          <option value="">
            None
          </option>
          <option
            v-for="list in bearerLists"
            :key="list.id"
            :value="list.id"
          >
            {{ list.name }}
          </option>
        </select>
      </template>
    </UiField>
  </div>
</template>
