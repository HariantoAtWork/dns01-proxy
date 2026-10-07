<script setup lang="ts">
import {
  PhArrowsClockwise as Reset,
  PhFloppyDisk as Save,
  PhGear as Gear,
} from '@phosphor-icons/vue'

useHead({ title: 'Settings' })

const {
  sharedMode,
  pending,
  loaded,
  restartBanner,
  sharedModeForcedByEnv,
  tinyDomain,
  tinyDomainSource,
  tinyDomainEnv,
  tinyDomainDraft,
  operator,
  general,
  database,
  api,
  logconfig,
  paths,
  sourceLabel,
  toggleTinyMode,
  saveTinyDomain,
  save,
  resetForm,
  clearOverrides,
} = useAppSettings()

const tocItems: Array<{ id: string, label: string }> = [
  { id: 'settings-tiny', label: 'Tiny mode' },
  { id: 'settings-operator', label: 'Operator' },
  { id: 'settings-txt', label: 'TXT' },
  { id: 'settings-general', label: 'Auth DNS' },
  { id: 'settings-api', label: 'API' },
  { id: 'settings-database', label: 'Database' },
  { id: 'settings-logconfig', label: 'Logging' },
  { id: 'settings-paths', label: 'Paths' },
]
</script>

<template>
  <div class="mx-auto max-w-[1100px] px-1 py-4 md:px-6 md:py-8">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="flex items-center gap-2 text-xl font-semibold text-ink md:text-2xl">
          <Gear :size="24" weight="regular" aria-hidden="true" />
          Settings
        </h1>
        <p class="mt-1 max-w-[65ch] text-sm text-muted">
          Edit operator (compose) values and <span class="font-mono text-ink">config.cfg</span> without rebuilding the image.
          Save writes the data volume. Reset reloads the form. Clear overrides drops dashboard ACME overrides so compose env wins again.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UiButton variant="ghost" size="sm" :disabled="pending" @click="resetForm">
          <Reset :size="14" weight="regular" aria-hidden="true" />
          Reset
        </UiButton>
        <UiButton variant="ghost" size="sm" :disabled="pending" @click="clearOverrides">
          Clear overrides
        </UiButton>
        <UiButton size="sm" :disabled="pending || !loaded" @click="save">
          <Save :size="14" weight="regular" aria-hidden="true" />
          Save
        </UiButton>
      </div>
    </div>

    <div
      v-if="restartBanner.length"
      class="mt-6 border border-danger bg-panel px-4 py-3 text-sm text-danger"
      style="border-radius: var(--radius-panel)"
    >
      Restart the container for: {{ restartBanner.join('; ') }}.
    </div>

    <div class="mt-6 flex flex-col gap-6 lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-start lg:gap-8">
      <aside class="sticky top-3 z-[1] -mx-1 border-b border-rule bg-paper/95 px-1 py-2 backdrop-blur-sm lg:top-6 lg:mx-0 lg:border-b-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
        <SettingsToc :items="tocItems" />
      </aside>

      <div class="min-w-0 space-y-6">
        <SettingsTinyPanel
          v-model:tiny-domain-draft="tinyDomainDraft"
          :api="api"
          :tiny-domain-source="tinyDomainSource"
          :tiny-domain-env="tinyDomainEnv"
          :shared-mode-forced-by-env="sharedModeForcedByEnv"
          :loaded="loaded"
          :pending="pending"
          :source-label="sourceLabel"
          :save-tiny-domain="saveTinyDomain"
          :toggle-tiny-mode="toggleTinyMode"
        />
        <SettingsOperatorPanel
          :operator="operator"
          :paths="paths"
          :shared-mode="sharedMode"
          :pending="pending"
          :source-label="sourceLabel"
        />
        <SettingsTxtPanel
          :operator="operator"
          :shared-mode="api.shared_mode"
          :pending="pending"
          :source-label="sourceLabel"
        />
        <SettingsAuthDnsPanel
          :general="general"
          :paths="paths"
          :shared-mode="api.shared_mode"
          :pending="pending"
        />
        <SettingsApiPanel
          :api="api"
          :pending="pending"
        />
        <SettingsDatabasePanel
          :database="database"
          :pending="pending"
        />
        <SettingsLoggingPanel
          :logconfig="logconfig"
          :pending="pending"
        />
        <SettingsPathsPanel
          :paths="paths"
          :shared-mode="api.shared_mode"
          :tiny-domain="tinyDomain"
          :tiny-domain-source="tinyDomainSource"
          :source-label="sourceLabel"
        />
      </div>
    </div>
  </div>
</template>
