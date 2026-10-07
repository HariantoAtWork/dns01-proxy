import type {
  CertBatchUploadPreview,
  CertBatchUploadResult,
  CertUploadResult,
  LastSavedItem,
  TrashItem,
} from '#shared/types/certs'
import { filenameFromDisposition, triggerDownload } from '#client/utils/download'

export function useCertDisk(deps: {
  loadStatus: () => Promise<unknown>
}) {
  const { loadStatus } = deps
  const trashItems = ref<TrashItem[]>([])
  const lastSavedItems = ref<LastSavedItem[]>([])

  async function loadTrash() {
    const data = await $fetch<{ items: TrashItem[] }>('/api/certs/trash')
    trashItems.value = data.items
    return data
  }

  async function downloadCert(certName: string) {
    const response = await fetch(`/api/certs/download/${encodeURIComponent(certName)}`, {
      credentials: 'same-origin',
    })
    if (!response.ok) {
      let message = 'Download failed'
      try {
        const body = await response.json() as { message?: string, statusMessage?: string }
        message = body.message || body.statusMessage || message
      }
      catch {
        // Keep the generic message when the error body is not JSON.
      }
      throw new Error(message)
    }

    const blob = await response.blob()
    triggerDownload(blob, filenameFromDisposition(response.headers.get('content-disposition')))
  }

  async function downloadCertsBatch() {
    const response = await fetch('/api/certs/download/batch', {
      credentials: 'same-origin',
    })
    if (!response.ok) {
      let message = 'Batch download failed'
      try {
        const body = await response.json() as { message?: string, statusMessage?: string }
        message = body.message || body.statusMessage || message
      }
      catch {
        // Keep the generic message when the error body is not JSON.
      }
      throw new Error(message)
    }

    const blob = await response.blob()
    triggerDownload(blob, filenameFromDisposition(response.headers.get('content-disposition')))
  }

  async function uploadCert(certName: string, file: File, overwrite = false): Promise<CertUploadResult> {
    const form = new FormData()
    form.append('file', file, file.name)

    const response = await fetch(
      `/api/certs/upload/${encodeURIComponent(certName)}?overwrite=${overwrite ? '1' : '0'}`,
      {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
      },
    )

    let body: CertUploadResult & { statusMessage?: string } = {
      success: false,
      message: 'Upload failed',
    }
    try {
      body = await response.json() as CertUploadResult & { statusMessage?: string }
    }
    catch {
      // Keep the generic message when the error body is not JSON.
    }

    if (!response.ok) {
      throw new Error(body.message || body.statusMessage || 'Upload failed')
    }

    if (!body.success) {
      throw Object.assign(new Error(body.message || 'Upload failed'), {
        needsOverwrite: body.needsOverwrite,
      })
    }

    return body
  }

  async function uploadCertsBatch(file: File, overwrite: string[] = []): Promise<CertBatchUploadResult> {
    const form = new FormData()
    form.append('file', file, file.name)
    if (overwrite.length) {
      form.append('overwrite', JSON.stringify(overwrite))
    }

    const response = await fetch('/api/certs/upload/batch', {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
    })

    let body: CertBatchUploadResult & { statusMessage?: string } = {
      success: false,
      message: 'Batch upload failed',
    }
    try {
      body = await response.json() as CertBatchUploadResult & { statusMessage?: string }
    }
    catch {
      // Keep the generic message when the error body is not JSON.
    }

    if (!response.ok) {
      throw new Error(body.message || body.statusMessage || 'Batch upload failed')
    }

    if (!body.success) {
      throw new Error(body.message || 'Batch upload failed')
    }

    return body
  }

  async function previewCertsBatch(file: File): Promise<CertBatchUploadPreview> {
    const form = new FormData()
    form.append('file', file, file.name)

    const response = await fetch('/api/certs/upload/batch/preview', {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
    })

    if (!response.ok) {
      let message = 'Could not read ZIP'
      try {
        const body = await response.json() as { message?: string, statusMessage?: string }
        message = body.message || body.statusMessage || message
      }
      catch {
        // Keep the generic message when the error body is not JSON.
      }
      throw new Error(message)
    }

    return await response.json() as CertBatchUploadPreview
  }

  async function trashCert(certName: string, fromTree: 'live' | 'staging' = 'live') {
    await $fetch(`/api/certs/trash/${encodeURIComponent(certName)}`, {
      method: 'POST',
      body: { fromTree },
    })
    await loadTrash()
    await loadStatus()
  }

  async function restoreTrash(certName: string) {
    await $fetch(`/api/certs/trash/${encodeURIComponent(certName)}/restore`, {
      method: 'POST',
    })
    await loadTrash()
    await loadStatus()
  }

  async function permanentDelete(certName: string) {
    await $fetch(`/api/certs/trash/${encodeURIComponent(certName)}`, {
      method: 'DELETE',
    })
    await loadTrash()
  }

  async function loadLastSaved() {
    const data = await $fetch<{ items: LastSavedItem[] }>('/api/certs/last-saved')
    lastSavedItems.value = data.items
    return data
  }

  async function restoreLastSaved(certName: string, fromTree: 'live' | 'staging') {
    await $fetch(`/api/certs/last-saved/${encodeURIComponent(certName)}/restore`, {
      method: 'POST',
      body: { fromTree },
    })
    await loadLastSaved()
    await loadStatus()
  }

  async function permanentDeleteLastSaved(certName: string, fromTree: 'live' | 'staging') {
    await $fetch(`/api/certs/last-saved/${encodeURIComponent(certName)}`, {
      method: 'DELETE',
      query: { fromTree },
    })
    await loadLastSaved()
  }

  return {
    trashItems,
    lastSavedItems,
    loadTrash,
    downloadCert,
    downloadCertsBatch,
    uploadCert,
    uploadCertsBatch,
    previewCertsBatch,
    trashCert,
    restoreTrash,
    permanentDelete,
    loadLastSaved,
    restoreLastSaved,
    permanentDeleteLastSaved,
  }
}
