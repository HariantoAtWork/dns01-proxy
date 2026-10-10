<script setup lang="ts">
import { PhGitFork as GitFork } from '@phosphor-icons/vue'
</script>

<template>
  <div class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
    <div class="flex items-center gap-2">
      <GitFork
        :size="22"
        weight="duotone"
        class="text-signal"
        aria-hidden="true"
      />
      <h1 class="text-2xl font-semibold tracking-tight text-ink">
        Router
      </h1>
    </div>

    <NuxtPage />
  </div>
</template>
