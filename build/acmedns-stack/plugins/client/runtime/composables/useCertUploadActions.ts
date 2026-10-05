import type { CertBatchUploadPreview, CertStatusEntry } from '#shared/types/certs'
import type { Ref } from 'vue'

export function useCertUploadActions(deps: {
  statusEntries: Ref<CertStatusEntry[]>
  loadStatus: () => Promise<unknown>
  uploadCert: (certName: string, file: File, overwrite?: boolean) => Promise<unknown>
  uploadCertsBatch: (file: File, overwrite?: string[]) => Promise<{ message?: string, imported?: string[] }>
  previewCertsBatch: (file: File) => Promise<CertBatchUploadPreview>
}) {
  const toasts = useToasts()
  const {
    statusEntries,
    loadStatus,
    uploadCert,
    uploadCertsBatch,
    previewCertsBatch,
  } = deps

  const uploadPending = ref<string | null>(null)
  const batchUploadPending = ref(false)
  const batchUploadModalOpen = ref(false)
  const batchUploadPreview = ref<CertBatchUploadPreview | null>(null)
  const uploadTarget = ref<string | null>(null)
  const uploadConfirmOpen = ref(false)
  const pendingUploadFile = ref<File | null>(null)
  const pendingBatchUploadFile = ref<File | null>(null)
  const certZipInput = useTemplateRef<HTMLInputElement>('cert-zip-input')
  const certBatchZipInput = useTemplateRef<HTMLInputElement>('cert-batch-zip-input')

  function onUploadRequest(certName: string) {
    uploadTarget.value = certName
    certZipInput.value?.click()
  }

  async function performUpload(certName: string, file: File, overwrite: boolean) {
    uploadPending.value = certName
    try {
      await uploadCert(certName, file, overwrite)
      await loadStatus()
      toasts.ok(`Imported live/${certName}`, 'Certificates')
    }
    catch (caught) {
      if (
        caught
        && typeof caught === 'object'
        && 'needsOverwrite' in caught
        && (caught as { needsOverwrite?: boolean }).needsOverwrite
      ) {
        pendingUploadFile.value = file
        uploadTarget.value = certName
        uploadConfirmOpen.value = true
        return
      }
      toasts.error(caught instanceof Error ? caught.message : 'Upload failed')
    }
    finally {
      uploadPending.value = null
    }
  }

  async function onCertZipSelected(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    const certName = uploadTarget.value
    if (!certName || !file) {
      return
    }

    if (!file.name.toLowerCase().endsWith('.zip')) {
      toasts.error('Choose a .zip file')
      uploadTarget.value = null
      return
    }

    const entry = statusEntries.value.find(item => item.certName === certName)
    if (entry?.liveOnDisk) {
      pendingUploadFile.value = file
      uploadConfirmOpen.value = true
      return
    }

    await performUpload(certName, file, false)
    uploadTarget.value = null
  }

  async function confirmCertUpload() {
    const file = pendingUploadFile.value
    const certName = uploadTarget.value
    uploadConfirmOpen.value = false
    pendingUploadFile.value = null
    if (!file || !certName) {
      uploadTarget.value = null
      return
    }

    await performUpload(certName, file, true)
    uploadTarget.value = null
  }

  function cancelCertUpload() {
    uploadConfirmOpen.value = false
    pendingUploadFile.value = null
    uploadTarget.value = null
  }

  function onBatchUploadRequest() {
    certBatchZipInput.value?.click()
  }

  async function performBatchUpload(file: File, overwrite: string[]) {
    batchUploadPending.value = true
    try {
      const result = await uploadCertsBatch(file, overwrite)
      await loadStatus()
      toasts.ok(result.message || `Imported ${result.imported?.length ?? 0} certificate(s)`, 'Certificates')
      batchUploadModalOpen.value = false
      batchUploadPreview.value = null
      pendingBatchUploadFile.value = null
    }
    catch (caught) {
      toasts.error(caught instanceof Error ? caught.message : 'Batch upload failed')
    }
    finally {
      batchUploadPending.value = false
    }
  }

  async function onBatchZipSelected(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) {
      return
    }

    if (!file.name.toLowerCase().endsWith('.zip')) {
      toasts.error('Choose a .zip file')
      return
    }

    batchUploadPending.value = true
    try {
      const preview = await previewCertsBatch(file)
      if (!preview.conflicts.length) {
        await performBatchUpload(file, [])
        return
      }

      pendingBatchUploadFile.value = file
      batchUploadPreview.value = preview
      batchUploadModalOpen.value = true
    }
    catch (caught) {
      toasts.error(caught instanceof Error ? caught.message : 'Could not read ZIP')
    }
    finally {
      batchUploadPending.value = false
    }
  }

  async function onBatchUploadConfirm(overwrite: string[]) {
    const file = pendingBatchUploadFile.value
    if (!file) {
      return
    }
    await performBatchUpload(file, overwrite)
  }

  function onBatchUploadCancel() {
    batchUploadModalOpen.value = false
    batchUploadPreview.value = null
    pendingBatchUploadFile.value = null
  }

  return {
    uploadPending,
    batchUploadPending,
    batchUploadModalOpen,
    batchUploadPreview,
    uploadTarget,
    uploadConfirmOpen,
    onUploadRequest,
    onCertZipSelected,
    confirmCertUpload,
    cancelCertUpload,
    onBatchUploadRequest,
    onBatchZipSelected,
    onBatchUploadConfirm,
    onBatchUploadCancel,
  }
}
