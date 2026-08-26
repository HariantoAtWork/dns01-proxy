export function useClipboardCopy() {
  const toasts = useToasts()
  const copied = ref(false)
  let copiedTimer: ReturnType<typeof setTimeout> | undefined

  function clipboardHost(): HTMLElement {
    // Modal <dialog showModal()> traps focus. A temp field on document.body
    // often cannot focus, so execCommand copies whatever was selected in the
    // dialog (e.g. one UUID segment) instead of the JS string.
    const active = document.activeElement
    if (active instanceof Element) {
      const fromActive = active.closest('dialog[open]')
      if (fromActive instanceof HTMLElement) {
        return fromActive
      }
    }
    const open = document.querySelector('dialog[open]')
    if (open instanceof HTMLElement) {
      return open
    }
    return document.body
  }

  function legacyWrite(text: string) {
    document.getSelection()?.removeAllRanges()

    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.setAttribute('aria-hidden', 'true')
    el.tabIndex = -1
    el.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;'

    const host = clipboardHost()
    host.appendChild(el)
    el.focus({ preventScroll: true })
    el.select()
    el.setSelectionRange(0, text.length)
    try {
      const ok = document.execCommand('copy')
      if (!ok) {
        throw new Error('execCommand copy failed')
      }
    }
    finally {
      host.removeChild(el)
    }
  }

  async function writeClipboard(text: string) {
    // Always write the argument string — never read from selection.
    if (import.meta.client && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        return
      }
      catch {
        // Fall through to legacy (HTTP / permission denied / modal focus).
      }
    }
    legacyWrite(text)
  }

  function isPasswordLabel(label: string) {
    return /^password$/i.test(label.trim())
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
      // Show the copied string so you can verify it — never echo passwords.
      const detail = isPasswordLabel(label) ? '' : text
      toasts.info(detail, `${label} copied`)
    }
    catch {
      toasts.error('Could not copy to clipboard')
    }
  }

  return { copyText, copied }
}
