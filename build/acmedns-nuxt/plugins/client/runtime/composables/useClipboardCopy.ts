import { useClipboard } from '@vueuse/core'

export function useClipboardCopy() {
  // legacy: true falls back to execCommand when Clipboard API is missing
  // (non-secure HTTP origins, older browsers).
  const { copy, copied, isSupported } = useClipboard({ legacy: true })
  const toasts = useToasts()

  async function copyText(value: string, label = 'Value') {
    const text = typeof value === 'string' ? value : String(value ?? '')
    if (!text) {
      toasts.error('Nothing to copy')
      return
    }

    if (!isSupported.value) {
      toasts.error('Clipboard is not available in this browser')
      return
    }

    try {
      // Clear any partial text selection (e.g. only `_acme-challenge`) so
      // legacy execCommand cannot prefer the visible selection over `text`.
      document.getSelection()?.removeAllRanges()
      await copy(text)
      toasts.info(`${label} copied`)
    }
    catch {
      toasts.error('Could not copy to clipboard')
    }
  }

  return { copyText, copied }
}
