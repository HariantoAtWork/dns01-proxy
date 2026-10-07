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

  /** Where the temp field may receive focus (modal dialogs trap focus). */
  function clipboardHost(from?: EventTarget | null): HTMLElement {
    if (from instanceof Element) {
      const dialog = from.closest('dialog[open]')
      if (dialog instanceof HTMLElement) {
        return dialog
      }
      if (from.parentElement instanceof HTMLElement) {
        return from.parentElement
      }
    }
    const open = document.querySelector('dialog[open]')
    if (open instanceof HTMLElement) {
      return open
    }
    return document.body
  }

  /**
   * HTTP / denied Clipboard API: put the JS string in a temporary field,
   * select that field (not page text), execCommand('copy'), remove it.
   * Field can be invisible, but must stay in a focusable ancestor (the open dialog).
   */
  function legacyWrite(text: string, from?: EventTarget | null) {
    document.getSelection()?.removeAllRanges()

    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.setAttribute('aria-hidden', 'true')
    el.tabIndex = -1
    // Selectable but not visible — display:none breaks selection in many browsers.
    el.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;'

    const host = clipboardHost(from)
    host.appendChild(el)
    el.focus({ preventScroll: true })
    el.select()
    el.setSelectionRange(0, text.length)
    try {
      if (!document.execCommand('copy')) {
        throw new Error('execCommand copy failed')
      }
    }
    finally {
      host.removeChild(el)
    }
  }

  async function writeClipboard(text: string, from?: EventTarget | null) {
    const writeText = writeTextApi()
    if (writeText) {
      try {
        await writeText(text)
        return
      }
      catch {
        // Permission / transient failure — try legacy below.
      }
    }
    legacyWrite(text, from)
  }

  async function copyText(value: string, label = 'Value', event?: Event) {
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
      await writeClipboard(text, event?.currentTarget ?? event?.target)
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
      const hint = typeof window !== 'undefined' && !window.isSecureContext
        ? 'Could not copy (try HTTPS or localhost)'
        : 'Could not write to the clipboard'
      toasts.error(hint)
    }
  }

  return { copyText, copied }
}
