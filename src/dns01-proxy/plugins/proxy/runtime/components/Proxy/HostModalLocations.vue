<script setup lang="ts">
import type { ForwardScheme, ProxyHostInput, ProxyLocation } from '#proxy-shared/types/proxyHost'
import { defaultForwardPort } from '#proxy-shared/utils/proxyHost'
import { PhPlus as Plus, PhTrash as Trash } from '@phosphor-icons/vue'

const {
  draft,
  pasteForwardTarget,
  blurLocationForward,
} = defineProps<{
  draft: ProxyHostInput
  pasteForwardTarget: (
    target: { forwardScheme: ForwardScheme, forwardHost: string, forwardPort: number },
    event: ClipboardEvent,
  ) => void
  blurLocationForward: (location: ProxyLocation) => void
}>()

function emptyLocation(): ProxyLocation {
  return {
    path: '/',
    forwardScheme: 'http',
    forwardHost: '',
    forwardPort: 80,
  }
}

function addLocation() {
  draft.locations = [...draft.locations, emptyLocation()]
}

function removeLocation(index: number) {
  draft.locations = draft.locations.filter((_, i) => i !== index)
}
</script>

<template>
  <div
    class="flex min-h-[14rem] flex-col gap-3"
    role="tabpanel"
  >
    <div class="flex items-center justify-between gap-2">
      <p class="text-sm text-muted">
        Path-specific forward targets
      </p>
      <UiButton
        variant="ghost"
        size="sm"
        @click="addLocation"
      >
        <Plus :size="14" weight="bold" aria-hidden="true" />
        Add Location
      </UiButton>
    </div>

    <p
      v-if="!draft.locations.length"
      class="text-sm text-muted"
    >
      No custom locations yet.
    </p>

    <div
      v-for="(location, index) in draft.locations"
      :key="index"
      class="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-rule p-3"
    >
      <div class="flex items-start justify-between gap-2">
        <p class="text-sm font-medium">
          Location {{ index + 1 }}
        </p>
        <UiButton
          variant="icon"
          size="sm"
          aria-label="Remove location"
          @click="removeLocation(index)"
        >
          <Trash :size="14" weight="regular" aria-hidden="true" />
        </UiButton>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <UiField label="Path">
          <UiInput
            v-model="location.path"
            mono
          />
        </UiField>
        <UiField label="Scheme">
          <select
            v-model="location.forwardScheme"
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
        </UiField>
        <UiField label="Forward Host">
          <UiInput
            v-model="location.forwardHost"
            mono
            @paste="pasteForwardTarget(location, $event)"
            @blur="blurLocationForward(location)"
          />
        </UiField>
        <UiField label="Port" :hint="`empty → ${defaultForwardPort(location.forwardScheme)}`">
          <input
            v-model.number="location.forwardPort"
            type="number"
            min="1"
            max="65535"
            :placeholder="String(defaultForwardPort(location.forwardScheme))"
            class="ui-input w-full border border-rule bg-paper px-3 py-2 font-mono text-sm"
            style="border-radius: var(--radius-input)"
            @paste="pasteForwardTarget(location, $event)"
          >
        </UiField>
      </div>
    </div>
  </div>
</template>
