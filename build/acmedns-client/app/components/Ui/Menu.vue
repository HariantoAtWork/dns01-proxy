<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'

const {
  align = 'right',
  labelledBy,
} = defineProps<{
  align?: 'left' | 'right'
  labelledBy?: string
}>()

const open = defineModel<boolean>('open', { default: false })
const root = useTemplateRef<HTMLElement>('root')
const panelId = useId()

onClickOutside(root, () => {
  open.value = false
})

function toggle() {
  open.value = !open.value
}

function close() {
  open.value = false
}

defineExpose({ close, toggle })
</script>

<template>
  <div ref="root" class="relative">
    <slot
      name="trigger"
      :open
      :toggle
      :panel-id="panelId"
      :labelled-by="labelledBy"
    />
    <div
      v-show="open"
      :id="panelId"
      role="menu"
      :aria-labelledby="labelledBy"
      class="absolute top-[calc(100%+0.35rem)] z-[20] min-w-[12rem] border border-rule bg-panel py-1 shadow-[0_12px_28px_var(--shadow)]"
      :class="align === 'left' ? 'left-0' : 'right-0'"
      style="border-radius: var(--radius-panel)"
      @keydown.escape="close"
    >
      <slot :close />
    </div>
  </div>
</template>
