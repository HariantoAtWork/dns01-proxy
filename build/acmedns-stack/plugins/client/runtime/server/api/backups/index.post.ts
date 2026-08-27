import type { BackupCreateBody, BackupMutationResult } from '#shared/types/backup'

export default defineEventHandler(async (event): Promise<BackupMutationResult> => {
  try {
    const body = await readBody<BackupCreateBody>(event)
    const kind = body?.kind

    if (kind !== 'full' && kind !== 'domain') {
      return { success: false, message: 'Backup kind must be full or domain' }
    }

    if (kind === 'full') {
      const filename = await createFullBackup(event)
      return { success: true, message: 'Full backup written', filename }
    }

    if (!body.domain?.trim()) {
      return { success: false, message: 'Domain is required for a hostname backup' }
    }

    const filename = await createDomainBackup(body.domain, event)
    return { success: true, message: 'Domain backup written', filename }
  }
  catch (error) {
    return backupFailure(error)
  }
})
