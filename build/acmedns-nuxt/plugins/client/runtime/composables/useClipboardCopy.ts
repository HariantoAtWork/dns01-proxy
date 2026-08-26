export function useClipboardCopy() {
  const toasts = useToasts()
  const copied = ref(false)
  let copiedTimer: ReturnType<typeof setTimeout> | undefined

  function legacyWrite(text: string) {
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.top = '0'
    el.style.left = '-9999px'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.focus()
    el.select()
    el.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    if (!ok) {
      throw new Error('execCommand copy failed')
    }
  }

  async function writeClipboard(text: string) {
    // Always write the argument string — never read from selection or a
    // cached VueUse source (that was pasting stale DNS names).
    if (import.meta.client && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        return
      }
      catch {
        // Fall through to legacy (HTTP / permission denied).
      }
    }
    legacyWrite(text)
  }

  async function copyText(value: string, label = 'Value') {
    const text = typeof value === 'string' ? value : String(value ?? '')
    if (!text) {
      toasts.error('Nothing to copy')
      return
    }

    if (!import.meta.client) {
      toasts.error('Clipboard is not available')
      return
    }

    try {
      await writeClipboard(text)
      copied.value = true
      if (copiedTimer) {
        clearTimeout(copiedTimer)
      }
      copiedTimer = setTimeout(() => {
        copied.value = false
      }, 1500)
      toasts.info(`${label} copied`)
    }
    catch {
      toasts.error('Could not copy to clipboard')
    }
  }

  return { copyText, copied }
}
