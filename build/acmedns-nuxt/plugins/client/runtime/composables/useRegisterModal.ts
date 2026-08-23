export function useRegisterModal() {
  const open = useState('register-modal-open', () => false)

  function show() {
    open.value = true
  }

  function hide() {
    open.value = false
  }

  return {
    open,
    show,
    hide,
  }
}
