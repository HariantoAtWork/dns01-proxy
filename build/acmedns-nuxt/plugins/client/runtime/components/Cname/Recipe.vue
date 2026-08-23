<script setup lang="ts">
import { PhCopy as Copy } from '@phosphor-icons/vue'
import {
  apexCnameExample,
  zoneCnameLine,
} from '#client/utils/domain'

const {
  domain,
  fulldomain,
  compact = false,
  embedded = false,
} = defineProps<{
  domain: string
  fulldomain: string
  /** Apex fields + drawers in one panel (domain detail / register). */
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
      <UiPanel accent>
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 class="text-base font-semibold tracking-tight">CNAME to publish</h2>
            <p class="mt-1 text-sm text-muted">Cloudflare Name and Content for the apex challenge.</p>
          </div>
          <UiButton variant="ghost" @click="copyText(zoneLine, 'Apex zone line')">
            <Copy :size="16" weight="regular" />
            Copy zone line
          </UiButton>
        </div>

        <dl class="mt-3 grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 font-mono text-sm">
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

        <div class="mt-3 flex flex-col border-t border-rule">
          <UiDisclosure flush title="Apex CNAME example">
            <CnameRecord :record="apex" :zone="domain" />
          </UiDisclosure>
          <CnameNestedDrawer flush :domain :fulldomain />
        </div>
      </UiPanel>
    </template>

    <template v-else-if="!embedded">
      <UiPanel accent>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold tracking-tight">CNAME to publish</h2>
            <p class="mt-1 max-w-[65ch] text-sm text-muted">
              Apex challenge goes to this UUID. Nested names open in the drawer below.
            </p>
          </div>
          <UiButton @click="copyText(zoneLine, 'Apex zone line')">
            <Copy :size="16" weight="regular" />
            Copy apex line
          </UiButton>
        </div>

        <h3 class="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Apex</h3>
        <CnameRecord class="mt-2" :record="apex" :zone="domain" />
      </UiPanel>
    </template>

    <template v-else>
      <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Apex</h3>
      <CnameRecord :record="apex" :zone="domain" />
    </template>
  </section>
</template>
