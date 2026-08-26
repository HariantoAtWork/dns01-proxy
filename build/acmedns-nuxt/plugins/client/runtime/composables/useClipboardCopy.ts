import { useClipboard } from '@vueuse/core'

export function useClipboardCopy() {
  // legacy: true falls back to execCommand when Clipboard API is missing
  // (non-secure HTTP origins, older browsers).
  const { copy, copied, isSupported } = useClipboard({ legacy: true })
  const toasts = useToasts()

  async function copyText(value: string, label = 'Value') {
    if (!value) {
      toasts.error('Nothing to copy')
      return
    }

    if (!isSupported.value) {
      toasts.error('Clipboard is not available in this browser')
      return
    }

    try {
      await copy(value)
      toasts.info(`${label} copied`)
    }
    catch {
      toasts.error('Could not copy to clipboard')
    }
  }

  return { copyText, copied }
}
