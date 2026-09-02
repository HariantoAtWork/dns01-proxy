<script setup lang="ts">
import type { DomainsParseResult, LetsEncryptDirectoryMode } from '#shared/types/certs'
import {
  dnsCheckClass,
  dnsCheckLabel,
  dnsCheckNeedsCopy,
  dnsChecksForLine,
} from '#shared/utils/certsUi'
import { cloudflareChallengeName } from '#client/utils/domain'
import { PhArrowsClockwise as ArrowsClockwise } from '@phosphor-icons/vue'

const open = defineModel<boolean>('open', { required: true })
const text = defineModel<string>('text', { required: true })

const {
  parsed,
  directoryMode,
  acmeEnabled,
  renewSchedulerEnabled,
  pending,
  dirty,
  error,
  dnsRecheckPending,
} = defineProps<{
  parsed: DomainsParseResult | null
  directoryMode: LetsEncryptDirectoryMode
  acmeEnabled: boolean
  renewSchedulerEnabled: boolean
  pending: boolean
  dirty: boolean
  error: string | null
  dnsRecheckPending: boolean
}>()

const emit = defineEmits<{
  save: []
  apply: [force: boolean]
  'toggle-renew-scheduler': []
  'recheck-dns': []
}>()

function cloudflareNameForCheck(zone: string, lineApex: string) {
  return cloudflareChallengeName(zone, lineApex)
}

const treeBadgeLabel = computed(() =>
  directoryMode === 'staging' ? 'staging/' : 'live/',
)

const treeBadgeClass = computed(() =>
  directoryMode === 'staging'
    ? 'border-rule text-muted'
    : 'border-live/40 text-live',
)
</script>

<template>
  <UiModal v-model:open="open" title="domains.txt" size="lg">
    <template #actions>
      <label
        class="inline-flex cursor-pointer items-center gap-2 rounded-[6px] border px-2.5 py-1 text-xs"
        :class="renewSchedulerEnabled ? 'border-rule text-ink' : 'border-danger text-danger'"
        title="Periodic production renew only. Does not block manual Apply or Force re-issue."
      >
        <input
          type="checkbox"
          class="accent-[var(--signal)]"
          :checked="renewSchedulerEnabled"
          :disabled="pending"
          @click.prevent="emit('toggle-renew-scheduler')"
        >
        Auto renew
        <span class="font-medium">{{ renewSchedulerEnabled ? 'on' : 'off' }}</span>
      </label>
      <UiButton variant="ghost" size="sm" :disabled="pending || !dirty" @click="emit('save')">
        Save
      </UiButton>
      <UiButton
        size="sm"
        :disabled="pending || dirty || (directoryMode === 'production' && !acmeEnabled)"
        @click="emit('apply', false)"
      >
        Apply
      </UiButton>
      <UiButton
        variant="ghost"
        size="sm"
        :disabled="pending || dirty || (directoryMode === 'production' && !acmeEnabled)"
        @click="emit('apply', true)"
      >
        Force re-issue
      </UiButton>
    </template>

    <p class="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
      One certificate per line. Save to validate, then Apply to issue to
      <span
        class="inline-flex rounded-[4px] border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide"
        :class="treeBadgeClass"
      >
        {{ treeBadgeLabel }}
      </span>.
    </p>

    <label class="mt-3 block">
      <span class="sr-only">domains.txt</span>
      <UiLineNumberedTextarea v-model="text" :disabled="pending" />
    </label>

    <UiDisclosure v-if="parsed?.lines?.length" title="Parsed lines" :open="true" class="mt-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs text-muted">
          Public + authoritative CNAME checks for <span class="font-mono text-ink">_acme-challenge</span> names.
          Apply preflight uses authoritative NS only (Let's Encrypt path).
        </p>
        <UiButton
          variant="ghost"
          size="sm"
          :disabled="pending || dnsRecheckPending"
          @click="emit('recheck-dns')"
        >
          <ArrowsClockwise
            :size="14"
            weight="regular"
            aria-hidden="true"
            :class="dnsRecheckPending && 'animate-spin'"
          />
          Recheck DNS
        </UiButton>
      </div>
      <ul class="mt-3 space-y-3">
        <li
          v-for="line in parsed.lines"
          :key="`${line.line}-${line.certName}`"
          class="rounded-[6px] border border-rule p-3"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <p class="font-mono text-sm text-ink">
              {{ line.certName }}
              <span class="text-muted">(line {{ line.line }})</span>
            </p>
          </div>
          <p class="mt-1 font-mono text-xs text-muted">
            SANs: {{ line.expanded.join(', ') }}
          </p>
          <ul v-if="dnsChecksForLine(line.line, parsed.dnsChecks).length" class="mt-3 space-y-2 border-t border-rule pt-3">
            <li
              v-for="check in dnsChecksForLine(line.line, parsed.dnsChecks)"
              :key="check.name"
              class="font-mono text-xs"
            >
              <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span
                  class="rounded-[4px] border border-rule px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                  :class="dnsCheckClass(check.status)"
                >
                  {{ dnsCheckLabel(check.status) }}
                </span>
                <span v-if="!dnsCheckNeedsCopy(check.status)" class="break-all text-ink">{{ check.name }}</span>
                <template v-else>
                  <span class="break-all text-ink">{{ check.name }}</span>
                  <span v-if="check.actual && check.status === 'mismatch'" class="text-danger">
                    (found {{ check.actual }})
                  </span>
                </template>
                <span v-if="check.message && check.status !== 'ok'" class="text-muted">
                  — {{ check.message }}
                </span>
              </div>
              <dl
                v-if="dnsCheckNeedsCopy(check.status) && check.expected"
                class="mt-2 grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 rounded-[6px] border border-rule bg-paper p-2"
              >
                <dt class="text-[10px] uppercase tracking-wide text-muted">Name</dt>
                <dd class="min-w-0">
                  <UiCopyable :value="check.name" label="Name" />
                  <p class="mt-0.5 font-sans text-[11px] text-muted">
                    Cloudflare:
                    <UiCopyable
                      inline
                      :value="cloudflareNameForCheck(check.zone, line.certName)"
                      label="Cloudflare Name"
                    />
                  </p>
                </dd>
                <dt class="text-[10px] uppercase tracking-wide text-muted">Content</dt>
                <dd class="min-w-0">
                  <UiCopyable :value="check.expected" label="Content" />
                </dd>
                <template v-if="check.serverUrl">
                  <dt class="text-[10px] uppercase tracking-wide text-muted">Server URL</dt>
                  <dd class="min-w-0">
                    <UiCopyable :value="check.serverUrl" label="Server URL" />
                  </dd>
                </template>
              </dl>
              <p
                v-else-if="!dnsCheckNeedsCopy(check.status)"
                class="mt-1 break-all text-muted"
              >
                → {{ check.expected || '—' }}
              </p>
            </li>
          </ul>
        </li>
      </ul>
    </UiDisclosure>

    <p v-if="dirty" class="mt-3 text-xs text-muted">
      Unsaved changes — Save before Apply.
    </p>
    <pre v-if="error" class="mt-2 whitespace-pre-wrap text-xs text-danger">{{ error }}</pre>
  </UiModal>
</template>
