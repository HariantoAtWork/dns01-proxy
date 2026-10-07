<script setup lang="ts">
import type { SettingSource } from '#shared/types/appSettings'

defineProps<{
  api: { shared_mode: boolean }
  tinyDomainSource?: SettingSource
  tinyDomainEnv: string
  sharedModeForcedByEnv: boolean
  loaded: boolean
  pending: boolean
  sourceLabel: (source: SettingSource | undefined) => string
  saveTinyDomain: () => void | Promise<void>
  toggleTinyMode: () => void | Promise<void>
}>()

const tinyDomainDraft = defineModel<string>('tinyDomainDraft', { required: true })
</script>

<template>
  <UiPanel id="settings-tiny" class="scroll-mt-20 lg:scroll-mt-6" accent>
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="min-w-0">
        <h2 class="text-base font-semibold tracking-tight">Tiny mode</h2>
        <p class="mt-1 max-w-[55ch] text-sm text-muted">
          Shared auth zone — no Register step, challenge CNAMEs target the apex.
          Sets <span class="font-mono text-ink">domain</span> / <span class="font-mono text-ink">nsname</span>
          and <span class="font-mono text-ink">shared_mode</span>.
        </p>
        <template v-if="api.shared_mode">
          <UiField
            class="mt-3 max-w-md"
            label="ACMEDNS_TINY_DOMAIN"
            :hint="tinyDomainSource ? sourceLabel(tinyDomainSource) : undefined"
          >
            <UiInput
              v-model="tinyDomainDraft"
              mono
              placeholder="auth.example.org"
              :disabled="!loaded || sharedModeForcedByEnv"
              @keydown.enter.prevent="saveTinyDomain"
              @blur="saveTinyDomain"
            />
          </UiField>
          <p v-if="tinyDomainEnv && tinyDomainSource === 'app-settings'" class="mt-2 font-mono text-xs text-muted">
            compose/env: {{ tinyDomainEnv }}
          </p>
          <p v-if="sharedModeForcedByEnv" class="mt-2 text-xs text-danger">
            Locked by compose/env <span class="font-mono">ACMEDNS_TINY_DOMAIN={{ tinyDomainEnv }}</span>.
          </p>
        </template>
        <p v-else class="mt-2 text-xs text-muted">
          Toggle saves immediately (dashboard override wins over
          <span class="font-mono">ACMEDNS_TINY_MODE</span>). Clear overrides to fall back to compose/env.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        class="relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors"
        :class="api.shared_mode ? 'border-signal bg-signal' : 'border-rule bg-panel'"
        :aria-checked="api.shared_mode"
        aria-label="Tiny mode"
        :disabled="pending || !loaded || sharedModeForcedByEnv"
        @click="toggleTinyMode"
      >
        <span
          class="inline-block size-6 rounded-full bg-paper shadow transition-transform"
          :class="api.shared_mode ? 'translate-x-7' : 'translate-x-1'"
        />
      </button>
    </div>
    <p class="mt-3 text-xs text-muted">
      {{ api.shared_mode ? 'On' : 'Off' }} — applies immediately. Domains becomes DNS setup; registration is disabled while on.
    </p>
    <SharedTinySummary v-if="api.shared_mode" class="mt-4" />
  </UiPanel>
</template>
