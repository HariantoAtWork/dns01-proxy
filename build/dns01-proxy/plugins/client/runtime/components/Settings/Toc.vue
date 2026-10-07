<script setup lang="ts">
export interface SettingsTocItem {
  id: string
  label: string
}

const { items } = defineProps<{
  items: SettingsTocItem[]
}>()

const activeId = ref('')
let observer: IntersectionObserver | null = null

function scrollTo(id: string) {
  const el = document.getElementById(id)
  if (!el) {
    return
  }
  activeId.value = id
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(() => {
  if (!import.meta.client || !items.length) {
    return
  }
  activeId.value = items[0]!.id

  const observed = items
    .map(item => document.getElementById(item.id))
    .filter((el): el is HTMLElement => Boolean(el))

  if (!observed.length) {
    return
  }

  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
      const top = visible[0]?.target
      if (top?.id) {
        activeId.value = top.id
      }
    },
    {
      rootMargin: '-12% 0px -55% 0px',
      threshold: [0, 0.25, 0.5, 1],
    },
  )

  for (const el of observed) {
    observer.observe(el)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <nav aria-label="Settings sections" class="settings-toc">
    <p class="mb-2 text-[0.65rem] font-semibold uppercase tracking-wide text-muted">
      On this page
    </p>
    <ul class="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
      <li v-for="item in items" :key="item.id" class="shrink-0 lg:shrink">
        <button
          type="button"
          class="block w-full rounded-[6px] px-2.5 py-1.5 text-left text-sm transition-colors"
          :class="activeId === item.id
            ? 'bg-paper font-medium text-ink'
            : 'text-muted hover:bg-paper/70 hover:text-ink'"
          :aria-current="activeId === item.id ? 'true' : undefined"
          @click="scrollTo(item.id)"
        >
          {{ item.label }}
        </button>
      </li>
    </ul>
  </nav>
</template>
