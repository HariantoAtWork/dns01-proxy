export function useCertQueueModal() {
  const open = useState('cert-queue-modal-open', () => false)

  function show() {
    open.value = true
  }

  function hide() {
    open.value = false
  }

  function toggle() {
    open.value = !open.value
  }

  return {
    open,
    show,
    hide,
    toggle,
  }
}
