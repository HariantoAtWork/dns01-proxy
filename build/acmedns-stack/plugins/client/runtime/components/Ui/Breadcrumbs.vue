<script setup lang="ts">
import { PhCaretRight as CaretRight } from '@phosphor-icons/vue'

const { items } = useBreadcrumbs()
</script>

<template>
  <nav aria-label="Breadcrumb" class="min-w-0">
    <ol class="flex flex-wrap items-center gap-1 text-sm text-muted">
      <li
        v-for="(item, index) in items"
        :key="`${item.label}-${index}`"
        class="inline-flex min-w-0 items-center gap-1"
      >
        <CaretRight
          v-if="index > 0"
          :size="12"
          weight="bold"
          class="shrink-0 text-rule"
          aria-hidden="true"
        />
        <NuxtLink
          v-if="item.to && index < items.length - 1"
          :to="item.to"
          class="truncate text-muted no-underline hover:text-ink"
        >
          {{ item.label }}
        </NuxtLink>
        <span
          v-else
          class="truncate font-medium text-ink"
          :aria-current="index === items.length - 1 ? 'page' : undefined"
        >
          {{ item.label }}
        </span>
      </li>
    </ol>
  </nav>
</template>
