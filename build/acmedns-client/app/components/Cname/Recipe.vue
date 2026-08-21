<script setup lang="ts">
import { PhCaretDown as CaretDown, PhCopy as Copy } from '@phosphor-icons/vue'
import {
  apexCnameExample,
  zoneCnameLine,
} from '~/utils/domain'

const {
  domain,
  fulldomain,
  compact = false,
  embedded = false,
} = defineProps<{
  domain: string
  fulldomain: string
  /** Two copy fields + drawers (domain detail / short register). */
  compact?: boolean
  embedded?: boolean
}>()

const { copyText } = useClipboardCopy()

const apex = computed(() => apexCnameExample(domain, fulldomain))
const zoneLine = computed(() => zoneCnameLine(domain, fulldomain))
</script>

<template>
  <section class="flex flex-col gap-3">
    <template v-if="compact">
      <div class="flex flex-col gap-3 border-l-4 border-signal bg-panel p-4" style="border-radius: var(--radius-panel)">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 class="text-base font-semibold tracking-tight">CNAME to publish</h2>
            <p class="mt-1 text-sm text-muted">Cloudflare Name and Content for the apex challenge.</p>
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-[6px] border border-rule px-3 py-2 text-sm text-ink hover:bg-paper active:scale-[0.98]"
            @click="copyText(zoneLine, 'Apex zone line')"
          >
            <Copy :size="16" weight="regular" />
            Copy zone line
          </button>
        </div>

        <dl class="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 font-mono text-sm">
          <dt class="text-xs uppercase tracking-wide text-muted">Name</dt>
          <dd>
            <button
              type="button"
              class="block max-w-full cursor-copy truncate text-left text-ink hover:text-signal"
              :title="apex.cloudflareName"
              @click="copyText(apex.cloudflareName, 'Name')"
            >
              {{ apex.cloudflareName }}
            </button>
            <p class="mt-0.5 font-sans text-xs text-muted">In zone {{ domain }}</p>
          </dd>

          <dt class="text-xs uppercase tracking-wide text-muted">Content</dt>
          <dd>
            <button
              type="button"
              class="block max-w-full cursor-copy truncate text-left text-ink hover:text-signal"
              :title="apex.target"
              @click="copyText(apex.target, 'Content')"
            >
              {{ apex.target }}
            </button>
            <p class="mt-0.5 font-sans text-xs text-muted">DNS only</p>
          </dd>
        </dl>
      </div>

      <details class="group border border-rule bg-panel" style="border-radius: var(--radius-panel)">
        <summary
          class="flex cursor-pointer list-none items-center justify-between gap-2 px-1 py-1 text-sm font-medium text-ink marker:content-none md:gap-3 md:px-4 md:py-3 [&::-webkit-details-marker]:hidden"
        >
          <span>Apex CNAME example</span>
          <CaretDown
            :size="16"
            weight="bold"
            class="shrink-0 text-muted transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div class="border-t border-rule px-1 py-1 md:px-4 md:py-4">
          <CnameRecord :record="apex" :zone="domain" />
        </div>
      </details>
    </template>

    <template v-else-if="!embedded">
      <div class="border-l-4 border-signal bg-panel p-4" style="border-radius: var(--radius-panel)">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold tracking-tight">CNAME to publish</h2>
            <p class="mt-1 max-w-[65ch] text-sm text-muted">
              Apex challenge goes to this UUID. Nested names open in the drawer below.
            </p>
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-[6px] bg-signal px-3 py-2 text-sm text-signal-ink active:scale-[0.98]"
            @click="copyText(zoneLine, 'Apex zone line')"
          >
            <Copy :size="16" weight="regular" />
            Copy apex line
          </button>
        </div>

        <h3 class="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Apex</h3>
        <CnameRecord class="mt-2" :record="apex" :zone="domain" />
      </div>
    </template>

    <template v-else>
      <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Apex</h3>
      <CnameRecord :record="apex" :zone="domain" />
    </template>
  </section>
</template>
