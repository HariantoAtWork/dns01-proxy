type ModalDismiss = () => void

/** Shared across all UiModal instances — only one top-layer dialog at a time. */
let activeDismiss: ModalDismiss | null = null

export function claimUiModal(dismiss: ModalDismiss): ModalDismiss | null {
  const other = activeDismiss
  activeDismiss = dismiss
  if (other && other !== dismiss) {
    return other
  }
  return null
}

export function releaseUiModal(dismiss: ModalDismiss) {
  if (activeDismiss === dismiss) {
    activeDismiss = null
  }
}
