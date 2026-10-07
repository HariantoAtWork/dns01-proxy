import { createReadStream } from 'node:fs'
import { basename } from 'node:path'

function attachmentFilename(path: string) {
  const safe = basename(path).replace(/["\\\r\n]/g, '_')
  return `attachment; filename="${safe || 'clientstorage.json'}"`
}

export default defineEventHandler(async (event) => {
  const filePath = await ensureStorageExists()

  setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  setHeader(event, 'Content-Disposition', attachmentFilename(filePath))
  setHeader(event, 'Cache-Control', 'no-store')

  return sendStream(event, createReadStream(filePath))
})
