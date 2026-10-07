<script setup lang="ts">
import { onClickOutside, useEventListener } from '@vueuse/core'

const VIEWPORT_MARGIN = 8
const GAP = 6

const {
  align = 'right',
  labelledBy,
} = defineProps<{
  align?: 'left' | 'right'
  labelledBy?: string
}>()

const open = defineModel<boolean>('open', { default: false })
const root = useTemplateRef<HTMLElement>('root')
const panel = useTemplateRef<HTMLElement>('panel')
const panelId = useId()

const panelStyle = ref({
  top: '0px',
  left: '0px',
  visibility: 'hidden' as 'hidden' | 'visible',
})

function close() {
  open.value = false
}

function toggle() {
  open.value = !open.value
}

function getTriggerElement() {
  return root.value?.firstElementChild as HTMLElement | null
}

function measurePanel() {
  const panelEl = panel.value
  if (!panelEl) {
    return null
  }

  panelEl.style.visibility = 'hidden'
  panelEl.style.display = 'block'

  const width = panelEl.offsetWidth
  const height = panelEl.offsetHeight

  return { width, height }
}

function positionPanel() {
  const trigger = getTriggerElement()
  const panelEl = panel.value
  if (!open.value || !trigger || !panelEl) {
    return
  }

  const size = measurePanel()
  if (!size) {
    return
  }

  const triggerRect = trigger.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const { width: panelWidth, height: panelHeight } = size

  let top = triggerRect.bottom + GAP
  const spaceBelow = viewportHeight - triggerRect.bottom - GAP - VIEWPORT_MARGIN
  const spaceAbove = triggerRect.top - GAP - VIEWPORT_MARGIN

  if (panelHeight > spaceBelow && spaceAbove > spaceBelow) {
    top = triggerRect.top - panelHeight - GAP
  }

  top = Math.min(
    Math.max(VIEWPORT_MARGIN, top),
    viewportHeight - panelHeight - VIEWPORT_MARGIN,
  )

  let left = align === 'right'
    ? triggerRect.right - panelWidth
    : triggerRect.left

  if (left + panelWidth > viewportWidth - VIEWPORT_MARGIN) {
    left = triggerRect.right - panelWidth
  }
  if (left < VIEWPORT_MARGIN) {
    left = triggerRect.left
  }
  if (left + panelWidth > viewportWidth - VIEWPORT_MARGIN) {
    left = viewportWidth - panelWidth - VIEWPORT_MARGIN
  }
  if (left < VIEWPORT_MARGIN) {
    left = VIEWPORT_MARGIN
  }

  panelStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    visibility: 'visible',
  }
}

watch(open, async (value) => {
  if (!value) {
    panelStyle.value.visibility = 'hidden'
    return
  }

  await nextTick()
  positionPanel()
})

useEventListener(window, 'resize', () => {
  if (open.value) {
    positionPanel()
  }
})

useEventListener(window, 'scroll', () => {
  if (open.value) {
    positionPanel()
  }
}, { capture: true })

onClickOutside(root, (event) => {
  const target = event.target as Node | null
  if (panel.value?.contains(target)) {
    return
  }
  open.value = false
})

defineExpose({ close, toggle })
</script>

<template>
  <div ref="root" class="relative inline-flex">
    <slot
      name="trigger"
      :open
      :toggle
      :panel-id="panelId"
      :labelled-by="labelledBy"
    />
    <Teleport to="body">
      <div
        v-show="open"
        :id="panelId"
        ref="panel"
        role="menu"
        :aria-labelledby="labelledBy"
        class="fixed z-[80] min-w-[12rem] border border-rule bg-panel py-1 shadow-[0_12px_28px_var(--shadow)]"
        :style="{
          top: panelStyle.top,
          left: panelStyle.left,
          visibility: panelStyle.visibility,
          borderRadius: 'var(--radius-panel)',
        }"
        @keydown.escape="close"
      >
        <slot :close />
      </div>
    </Teleport>
  </div>
</template>
