<script setup lang="ts">
import { CHALLENGE_LABEL } from '#client/utils/domain'

const { apex, fulldomain, nested } = defineProps<{
  apex: string
  fulldomain: string
  nested: readonly string[]
}>()

const apexChallenge = computed(() => `${CHALLENGE_LABEL}.${apex}`)
</script>

<template>
  <figure class="border border-dashed border-rule p-3" style="border-radius: var(--radius-input)">
    <figcaption class="text-xs uppercase tracking-wide text-muted">How Let's Encrypt follows it</figcaption>
    <ol class="mt-3 space-y-2 font-mono text-xs sm:text-sm">
      <li
        v-for="label in nested"
        :key="label"
        class="flex flex-wrap items-baseline gap-x-2 gap-y-1"
      >
        <span class="text-muted">*.{{ label }}.{{ apex }}</span>
        <span class="text-muted" aria-hidden="true">→</span>
        <span>
          <span class="font-semibold text-signal">{{ CHALLENGE_LABEL }}</span>.{{ label }}.{{ apex }}
        </span>
        <span class="text-muted" aria-hidden="true">→</span>
        <span>
          <span class="font-semibold text-signal">{{ CHALLENGE_LABEL }}</span>.{{ apex }}
        </span>
      </li>
      <li class="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-rule pt-2">
        <span>{{ apex }} / *.{{ apex }}</span>
        <span class="text-muted" aria-hidden="true">→</span>
        <span>
          <span class="font-semibold text-signal">{{ CHALLENGE_LABEL }}</span>.{{ apex }}
        </span>
        <span class="text-muted" aria-hidden="true">→</span>
        <span class="break-all text-ink">{{ fulldomain }}</span>
      </li>
    </ol>
  </figure>
</template>
