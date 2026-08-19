import { useClipboard } from '@vueuse/core'

export function useClipboardCopy() {
  const { copy, copied, isSupported } = useClipboard()
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

    await copy(value)
    toasts.info(`${label} copied`)
  }

  return { copyText, copied }
}
