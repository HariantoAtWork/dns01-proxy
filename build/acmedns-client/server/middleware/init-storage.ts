export default defineEventHandler(async () => {
  try {
    await ensureStorageExists()
  }
  catch (error) {
    console.error('Failed to initialise storage:', error)
  }
})
