export default defineEventHandler(async () => {
  try {
    seedDataRootSync()
    await ensureStorageExists()
  }
  catch (error) {
    console.error('Failed to initialise storage:', error)
  }
})
