export type ToastTone = 'ok' | 'error' | 'info'

export interface ToastItem {
  id: string
  tone: ToastTone
  title: string
  detail: string
}

export function useToasts() {
  const items = useState<ToastItem[]>('toasts', () => [])
  const dismissTimers = useState<Record<string, number>>('toast-dismiss-timers', () => ({}))

  function clearDismissTimer(id: string) {
    if (!import.meta.client) {
      return
    }

    const timer = dismissTimers.value[id]
    if (timer !== undefined) {
      window.clearTimeout(timer)
      const next = { ...dismissTimers.value }
      delete next[id]
      dismissTimers.value = next
    }
  }

  function scheduleDismiss(id: string, life: number) {
    clearDismissTimer(id)

    if (import.meta.client && life > 0) {
      const timer = window.setTimeout(() => dismiss(id), life)
      dismissTimers.value = { ...dismissTimers.value, [id]: timer }
    }
  }

  function dismiss(id: string) {
    clearDismissTimer(id)
    items.value = items.value.filter(item => item.id !== id)
  }

  function push(tone: ToastTone, title: string, detail: string, life = 4000) {
    const id = crypto.randomUUID()
    items.value = [...items.value, { id, tone, title, detail }]
    scheduleDismiss(id, life)
    return id
  }

  function update(id: string, tone: ToastTone, title: string, detail: string, life = 4000) {
    const index = items.value.findIndex(item => item.id === id)
    if (index === -1) {
      return push(tone, title, detail, life)
    }

    const next = [...items.value]
    next[index] = { id, tone, title, detail }
    items.value = next
    scheduleDismiss(id, life)
    return id
  }

  return {
    items,
    push,
    update,
    dismiss,
    ok: (detail: string, title = 'Done') => push('ok', title, detail, 4000),
    error: (detail: string, title = 'Error') => push('error', title, detail, 5000),
    info: (detail: string, title = 'Copied') => push('info', title, detail, 2000),
  }
}
