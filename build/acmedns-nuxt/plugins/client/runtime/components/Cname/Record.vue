<script setup lang="ts">
import { PhCopy as Copy } from '@phosphor-icons/vue'
import { CHALLENGE_LABEL } from '#client/utils/domain'
import type { CnameExample } from '#client/utils/domain'

const { record, zone } = defineProps<{
  record: CnameExample
  zone: string
}>()

const { copyText } = useClipboardCopy()

const zoneLine = computed(() => `${record.name}. IN CNAME ${record.target}.`)

function splitName(value: string) {
  if (value === CHALLENGE_LABEL || value.startsWith(`${CHALLENGE_LABEL}.`)) {
    return { prefix: CHALLENGE_LABEL, rest: value.slice(CHALLENGE_LABEL.length) }
  }
  return { prefix: '', rest: value }
}

const fqdnParts = computed(() => splitName(record.name))
const cfParts = computed(() => splitName(record.cloudflareName))
</script>

<template>
  <article class="border border-rule bg-paper p-1 md:p-3" style="border-radius: var(--radius-input)">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <p class="text-sm text-muted">
        Covers <span class="font-mono text-ink">{{ record.covers }}</span>
      </p>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-[4px] px-2 py-1 text-xs text-muted hover:bg-panel hover:text-ink"
        @click="copyText(zoneLine, 'Zone line')"
      >
        <Copy :size="14" weight="regular" />
        Copy
      </button>
    </div>

    <dl class="mt-3 grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 font-mono text-sm">
      <dt class="text-xs uppercase tracking-wide text-muted">Type</dt>
      <dd class="text-ink">CNAME</dd>

      <dt class="text-xs uppercase tracking-wide text-muted">Name</dt>
      <dd>
        <button
          type="button"
          class="block max-w-full cursor-copy truncate text-left hover:text-signal"
          :title="record.cloudflareName"
          @click="copyText(record.cloudflareName, 'Cloudflare Name')"
        >
          <span class="font-semibold text-signal">{{ cfParts.prefix }}</span><span>{{ cfParts.rest }}</span>
        </button>
        <p class="mt-0.5 font-sans text-xs text-muted">In zone {{ zone }} (Cloudflare Name)</p>
      </dd>

      <dt class="text-xs uppercase tracking-wide text-muted">Content</dt>
      <dd>
        <button
          type="button"
          class="block max-w-full cursor-copy truncate text-left hover:text-signal"
          :title="record.target"
          @click="copyText(record.target, 'CNAME content')"
        >
          {{ record.target }}
        </button>
      </dd>

      <dt class="text-xs uppercase tracking-wide text-muted">Proxy</dt>
      <dd class="font-sans text-ink">DNS only</dd>
    </dl>

    <p class="mt-3 break-all font-mono text-xs text-muted">
      Publishes as
      <span class="text-ink">
        <span class="font-semibold text-signal">{{ fqdnParts.prefix }}</span>{{ fqdnParts.rest }}
      </span>
      CNAME {{ record.target }}
    </p>
  </article>
</template>
