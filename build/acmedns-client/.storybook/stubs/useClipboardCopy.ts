export function useClipboardCopy() {
  async function copyText(value: string, label = 'Value') {
    if (!value) {
      console.warn('[storybook] nothing to copy')
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      console.info(`[storybook] ${label} copied`)
    }
    catch (error) {
      console.warn('[storybook] clipboard failed', error)
    }
  }

  return {
    copyText,
    copied: { value: false },
  }
}
