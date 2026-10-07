<script setup lang="ts">
const {
  variant = 'signal',
  size = 'md',
  type = 'button',
  disabled = false,
  to,
} = defineProps<{
  variant?: 'signal' | 'ghost' | 'danger' | 'icon'
  size?: 'sm' | 'md'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  to?: string
}>()

const sizeClass = computed(() => {
  if (variant === 'icon') {
    return size === 'sm' ? 'p-1.5' : 'p-2'
  }
  return size === 'sm' ? 'gap-1 px-2 py-1 text-xs' : 'gap-2 px-3 py-2 text-sm'
})

const variantClass = computed(() => {
  switch (variant) {
    case 'ghost':
      return 'border border-rule text-ink hover:bg-panel'
    case 'danger':
      return 'border border-danger bg-transparent text-danger hover:bg-panel'
    case 'icon':
      return 'border border-rule text-muted hover:bg-paper hover:text-ink'
    default:
      return 'bg-signal text-signal-ink hover:brightness-105'
  }
})
</script>

<template>
  <NuxtLink
    v-if="to"
    :to
    class="ui-btn inline-flex items-center justify-center no-underline transition-colors active:scale-[0.98]"
    :class="[sizeClass, variantClass, disabled && 'pointer-events-none opacity-50']"
    style="border-radius: var(--radius-panel)"
  >
    <slot />
  </NuxtLink>
  <button
    v-else
    :type
    class="ui-btn inline-flex items-center justify-center transition-colors active:scale-[0.98] disabled:opacity-50"
    :class="[sizeClass, variantClass]"
    style="border-radius: var(--radius-panel)"
    :disabled
  >
    <slot />
  </button>
</template>
