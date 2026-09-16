<script setup lang="ts">
import { formatTime } from '#shared/utils/certsUi'

const { value } = defineProps<{
  /** ISO-8601 timestamp */
  value: string
}>()
</script>

<template>
  <!-- Locale/TZ differ between SSR and the browser — only format on the client. -->
  <ClientOnly>
    <time :datetime="value">{{ formatTime(value) }}</time>
    <template #fallback>
      <time :datetime="value" class="text-muted">…</time>
    </template>
  </ClientOnly>
</template>
