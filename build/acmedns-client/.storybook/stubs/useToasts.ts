export type ToastTone = 'ok' | 'error' | 'info'

export function useToasts() {
  function push(tone: ToastTone, title: string, detail: string) {
    console.info(`[storybook toast:${tone}] ${title}: ${detail}`)
  }

  return {
    items: { value: [] as Array<{ id: number, tone: ToastTone, title: string, detail: string }> },
    push,
    dismiss: (_id: number) => {},
    ok: (detail: string, title = 'Done') => push('ok', title, detail),
    error: (detail: string, title = 'Error') => push('error', title, detail),
    info: (detail: string, title = 'Copied') => push('info', title, detail),
  }
}
