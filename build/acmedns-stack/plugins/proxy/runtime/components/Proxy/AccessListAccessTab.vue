<script setup lang="ts">
import type { AccessListRule, AccessRuleDirective } from '#proxy-shared/types/accessList'
import { ACCESS_LIST_PRESETS } from '#proxy-shared/utils/accessList'
import { PhTrash as Trash } from '@phosphor-icons/vue'

const rules = defineModel<AccessListRule[]>('rules', { required: true })
const formError = defineModel<string | null>('formError', { required: true })

const {
  fetchClientIp,
  addRule,
  focusAccessTab,
} = defineProps<{
  fetchClientIp: () => Promise<{ address: string | null, via: string | null }>
  addRule: (directive: AccessRuleDirective, address: string) => void
  focusAccessTab: () => void
}>()

const pasteAddress = ref('')
const clientIpHint = ref<string | null>(null)

function removeRule(index: number) {
  rules.value = rules.value.filter((_, i) => i !== index)
}

function applyPreset(addresses: string[]) {
  for (const address of addresses) {
    addRule('allow', address)
  }
}

async function useMyIp() {
  formError.value = null
  try {
    const data = await fetchClientIp()
    if (!data.address) {
      formError.value = 'Could not detect your IP from this request'
      focusAccessTab()
      return
    }
    clientIpHint.value = data.via ? `${data.address} via ${data.via}` : data.address
    addRule('allow', data.address)
  }
  catch (err) {
    formError.value = err instanceof Error ? err.message : 'Failed to detect IP'
    focusAccessTab()
  }
}

function onPasteAddress() {
  const raw = pasteAddress.value.trim()
  if (!raw) {
    return
  }
  addRule('allow', raw)
  pasteAddress.value = ''
}

function resetAccessUi() {
  pasteAddress.value = ''
  clientIpHint.value = null
}

defineExpose({ resetAccessUi })
</script>

<template>
  <div
    class="flex min-h-[14rem] flex-col gap-3"
    role="tabpanel"
  >
    <p class="text-sm text-muted">
      Allow these → everyone else denied (implicit deny all when any rule exists).
    </p>
    <div class="flex flex-wrap gap-2">
      <UiButton
        variant="ghost"
        size="sm"
        @click="useMyIp"
      >
        Use my IP
      </UiButton>
      <UiButton
        v-for="preset in ACCESS_LIST_PRESETS"
        :key="preset.label"
        variant="ghost"
        size="sm"
        @click="applyPreset(preset.addresses)"
      >
        {{ preset.label }}
      </UiButton>
    </div>
    <p
      v-if="clientIpHint"
      class="text-xs text-muted"
    >
      Detected {{ clientIpHint }}
    </p>
    <div class="flex flex-wrap items-end gap-2">
      <UiField
        class="min-w-[12rem] flex-1"
        label="Paste IP / CIDR"
      >
        <UiInput
          v-model="pasteAddress"
          mono
          @keydown.enter.prevent="onPasteAddress"
        />
      </UiField>
      <UiButton
        size="sm"
        @click="onPasteAddress"
      >
        Allow
      </UiButton>
    </div>
    <p
      v-if="!rules.length"
      class="text-sm text-muted"
    >
      No rules yet — without rules, only Basic Auth (if any) applies.
    </p>
    <div
      v-for="(rule, index) in rules"
      :key="`${rule.directive}-${rule.address}-${index}`"
      class="flex items-center justify-between gap-2 rounded-[var(--radius-panel)] border border-rule px-3 py-2"
    >
      <div class="flex items-center gap-2 text-sm">
        <select
          v-model="rule.directive"
          class="ui-input border border-rule bg-paper px-2 py-1 text-sm"
          style="border-radius: var(--radius-input)"
        >
          <option value="allow">
            Allow
          </option>
          <option value="deny">
            Deny
          </option>
        </select>
        <span class="font-mono text-xs">{{ rule.address }}</span>
      </div>
      <UiButton
        variant="icon"
        size="sm"
        aria-label="Remove rule"
        @click="removeRule(index)"
      >
        <Trash :size="14" weight="regular" aria-hidden="true" />
      </UiButton>
    </div>
  </div>
</template>
