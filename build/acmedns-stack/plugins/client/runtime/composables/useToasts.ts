export type ToastTone = 'ok' | 'error' | 'info'

export interface ToastItem {
  id: number
  tone: ToastTone
  title: string
  detail: string
}

export function useToasts() {
  const items = useState<ToastItem[]>('toasts', () => [])
  let nextId = 1

  function dismiss(id: number) {
    items.value = items.value.filter(item => item.id !== id)
  }

  function push(tone: ToastTone, title: string, detail: string, life = 4000) {
    const id = nextId++
    items.value = [...items.value, { id, tone, title, detail }]

    if (import.meta.client && life > 0) {
      window.setTimeout(() => dismiss(id), life)
    }
  }

  return {
    items,
    push,
    dismiss,
    ok: (detail: string, title = 'Done') => push('ok', title, detail, 4000),
    error: (detail: string, title = 'Error') => push('error', title, detail, 5000),
    info: (detail: string, title = 'Copied') => push('info', title, detail, 2000),
  }
}
