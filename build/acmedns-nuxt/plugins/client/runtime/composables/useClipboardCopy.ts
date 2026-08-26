export function useClipboardCopy() {
  const toasts = useToasts()
  const copied = ref(false)
  let copiedTimer: ReturnType<typeof setTimeout> | undefined

  function isPasswordLabel(label: string) {
    return /^password$/i.test(label.trim())
  }

  function writeTextApi(): Clipboard['writeText'] | null {
    if (!import.meta.client || typeof navigator === 'undefined') {
      return null
    }
    const writeText = navigator.clipboard?.writeText
    return typeof writeText === 'function' ? writeText.bind(navigator.clipboard) : null
  }

  async function copyText(value: string, label = 'Value') {
    const text = typeof value === 'string' ? value : String(value ?? '')
    if (!text) {
      toasts.error('Nothing to copy')
      return
    }

    const writeText = writeTextApi()
    if (!writeText) {
      const hint = import.meta.client && typeof window !== 'undefined' && !window.isSecureContext
        ? 'Clipboard needs HTTPS or localhost'
        : 'Clipboard API is not available'
      toasts.error(hint)
      return
    }

    try {
      // Async Clipboard API only — write the JS string, no DOM / selection.
      await writeText(text)
      copied.value = true
      if (copiedTimer) {
        clearTimeout(copiedTimer)
      }
      copiedTimer = setTimeout(() => {
        copied.value = false
      }, 1500)
      const detail = isPasswordLabel(label) ? '' : text
      toasts.info(detail, `${label} copied`)
    }
    catch {
      toasts.error('Could not write to the clipboard')
    }
  }

  return { copyText, copied }
}
