<script setup lang="ts">
import { PhTrafficSignal as TrafficSignal } from '@phosphor-icons/vue'
import {
  port53SummaryLabel,
  port53SummaryTone,
  port53ToneBarClass,
  port53ToneTextClass,
} from '#shared/utils/port53Reachability'

const toasts = useToasts()

const {
  port53,
  host,
  loading,
  refreshing,
  load,
  refresh,
} = usePublicIps()

onMounted(() => {
  void load()
})

async function onRecheck() {
  const toastId = toasts.push('info', 'Port 53', 'Checking UDP port 53 on your public IP…', 0)

  try {
    await refresh()
    const summary = port53.value?.summary
    const detail = port53.value
      ? port53SummaryLabel(port53.value.summary)
      : 'Port 53 check finished'

    if (summary === 'ok') {
      toasts.update(toastId, 'ok', 'Port 53', detail)
      return
    }

    if (summary === 'failed') {
      toasts.update(toastId, 'error', 'Port 53', detail)
      return
    }

    toasts.update(toastId, 'info', 'Port 53', detail)
  }
  catch (caught) {
    const detail = caught instanceof Error ? caught.message : 'Port 53 recheck failed'
    toasts.update(toastId, 'error', 'Port 53', detail, 5000)
  }
}

const tone = computed(() => port53SummaryTone(port53.value?.summary))
const toneTextClass = computed(() => port53ToneTextClass(tone.value))
const toneBarClass = computed(() => port53ToneBarClass(tone.value))

const busy = computed(() => loading.value || refreshing.value)

const detailLine = computed(() => {
  if (busy.value && !port53.value) {
    return 'Checking UDP port 53 on your public IP…'
  }
  if (port53.value) {
    return port53SummaryLabel(port53.value.summary)
  }
  return 'Open Internet in the header for addresses and DNS probes'
})

const publicIpLine = computed(() => {
  const probe = port53.value?.hostPublic[0]
  if (probe) {
    return probe.target
  }
  const echo = host.value[0]?.address
  return echo || ''
})
</script>

<template>
  <div
    class="flex flex-wrap items-center justify-between gap-3 border px-4 py-3"
    :class="toneBarClass"
    style="border-radius: var(--radius-panel)"
  >
    <div class="flex min-w-0 items-center gap-3">
      <TrafficSignal
        :size="22"
        weight="fill"
        class="shrink-0"
        :class="busy && !port53 ? 'text-muted' : toneTextClass"
        aria-hidden="true"
      />
      <div class="min-w-0">
        <p class="text-sm font-semibold text-ink">Reachable</p>
        <p class="mt-0.5 text-sm text-muted">
          {{ detailLine }}
          <template v-if="publicIpLine">
            · <span class="font-mono text-ink">{{ publicIpLine }}</span>
          </template>
        </p>
        <p v-if="port53?.hint && port53.summary !== 'ok'" class="mt-1 max-w-[65ch] text-xs text-muted">
          {{ port53.hint }}
        </p>
      </div>
    </div>
    <button
      type="button"
      class="shrink-0 rounded-[6px] border border-rule px-3 py-1.5 text-sm text-muted transition-colors hover:bg-paper hover:text-ink"
      :disabled="busy"
      @click="onRecheck()"
    >
      Recheck
    </button>
  </div>
</template>
