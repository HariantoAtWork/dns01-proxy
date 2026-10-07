<script setup lang="ts">
const {
  status,
  attempts,
  totalAttempts,
  message,
} = defineProps<{
  status: string
  attempts: number
  totalAttempts: number
  message: string
}>()

const emit = defineEmits<{
  cancel: []
}>()
</script>

<template>
  <UiPanel role="status">
    <p class="font-medium">
      Checking DNS record. Attempt {{ attempts }} of {{ totalAttempts }}
    </p>
    <p class="mt-1 text-sm text-muted">{{ message }}</p>
    <div class="mt-3 h-1 overflow-hidden bg-rule">
      <div
        class="h-full bg-signal transition-[width] duration-300"
        :style="{ width: `${Math.min(100, (attempts / totalAttempts) * 100)}%` }"
      />
    </div>
    <p v-if="status === 'running'" class="mt-3 text-sm text-muted">
      Public resolvers are queried every 15 seconds. Propagation can take a while.
    </p>
    <UiButton
      v-if="status === 'running'"
      class="mt-4"
      variant="ghost"
      @click="emit('cancel')"
    >
      Cancel
    </UiButton>
  </UiPanel>
</template>
