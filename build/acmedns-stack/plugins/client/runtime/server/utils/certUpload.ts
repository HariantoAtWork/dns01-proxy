import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import type { CertBatchUploadPreview, CertBatchUploadResult, CertUploadResult } from '#shared/types/certs'
import { assertSafeCertName } from './certDownload'
import { snapshotCertToLastSaved } from './certLastSaved'
import { PEM_NAMES, certTreePath, writeLivePems } from './letsencryptFs'
import { groupZipCertFolders, parseZipStore, parseZipStorePaths } from './zipStore'

const MAX_SINGLE_ZIP_BYTES = 2 * 1024 * 1024
const MAX_BATCH_ZIP_BYTES = 20 * 1024 * 1024

function assertPemBody(content: string, label: string, fileName: string) {
  const trimmed = content.trim()
  if (!trimmed.includes(`BEGIN ${label}`) || !trimmed.includes(`END ${label}`)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${fileName} is not a valid ${label} PEM`,
    })
  }
}

async function liveCertExists(certName: string) {
  try {
    await fs.access(join(certTreePath('production', certName), 'fullchain.pem'))
    return true
  }
  catch {
    return false
  }
}

function readPemBundle(entries: Record<string, Buffer>, certName: string) {
  for (const pemName of PEM_NAMES) {
    if (!entries[pemName]?.length) {
      throw createError({
        statusCode: 400,
        statusMessage: `${certName}: ZIP is missing ${pemName}`,
      })
    }
  }

  const cert = entries['cert.pem']!.toString('utf8')
  const chain = entries['chain.pem']!.toString('utf8')
  const fullchain = entries['fullchain.pem']!.toString('utf8')
  const privkey = entries['privkey.pem']!.toString('utf8')

  assertPemBody(cert, 'CERTIFICATE', `${certName}/cert.pem`)
  assertPemBody(chain, 'CERTIFICATE', `${certName}/chain.pem`)
  assertPemBody(fullchain, 'CERTIFICATE', `${certName}/fullchain.pem`)
  assertPemBody(privkey, 'PRIVATE KEY', `${certName}/privkey.pem`)

  return { cert, chain, fullchain, privkey }
}

export async function importLiveCertPems(
  certName: string,
  entries: Record<string, Buffer>,
  options?: { overwrite?: boolean },
): Promise<CertUploadResult> {
  const safeName = assertSafeCertName(certName)
  const exists = await liveCertExists(safeName)

  if (exists && !options?.overwrite) {
    return {
      success: false,
      needsOverwrite: true,
      message: `live/${safeName} already exists — upload again with overwrite to replace it`,
    }
  }

  const pems = readPemBundle(entries, safeName)

  if (exists) {
    await snapshotCertToLastSaved('production', safeName)
  }

  await writeLivePems('production', safeName, pems)

  return {
    success: true,
    message: exists
      ? `Replaced live/${safeName} from ZIP`
      : `Imported live/${safeName} from ZIP`,
  }
}

export async function importLiveCertZip(
  certName: string,
  zipBuffer: Buffer,
  options?: { overwrite?: boolean },
): Promise<CertUploadResult> {
  if (!zipBuffer.length) {
    throw createError({ statusCode: 400, statusMessage: 'ZIP file is empty' })
  }
  if (zipBuffer.length > MAX_SINGLE_ZIP_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'ZIP file is larger than 2 MiB' })
  }

  return importLiveCertPems(certName, parseZipStore(zipBuffer), options)
}

function assertBatchZipSize(zipBuffer: Buffer) {
  if (!zipBuffer.length) {
    throw createError({ statusCode: 400, statusMessage: 'ZIP file is empty' })
  }
  if (zipBuffer.length > MAX_BATCH_ZIP_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'ZIP file is larger than 20 MiB' })
  }
}

async function parseBatchZipFolders(zipBuffer: Buffer) {
  assertBatchZipSize(zipBuffer)

  const folders = groupZipCertFolders(parseZipStorePaths(zipBuffer))
  const certNames = Object.keys(folders).sort()

  if (!certNames.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Batch ZIP must contain cert folders like example.org/cert.pem',
    })
  }

  const conflicts: string[] = []
  for (const certName of certNames) {
    if (await liveCertExists(assertSafeCertName(certName))) {
      conflicts.push(certName)
    }
  }

  const conflictSet = new Set(conflicts)
  const newCerts = certNames.filter(name => !conflictSet.has(name))

  return { folders, certNames, conflicts, newCerts }
}

export async function previewLiveCertsBatchZip(zipBuffer: Buffer): Promise<CertBatchUploadPreview> {
  const { certNames, conflicts, newCerts } = await parseBatchZipFolders(zipBuffer)
  return { certNames, conflicts, newCerts }
}

export async function importLiveCertsBatchZip(
  zipBuffer: Buffer,
  options?: { overwrite?: string[] },
): Promise<CertBatchUploadResult> {
  const { folders, certNames } = await parseBatchZipFolders(zipBuffer)
  const overwriteSet = new Set((options?.overwrite ?? []).map(name => assertSafeCertName(name)))

  const imported: string[] = []
  const skipped: string[] = []

  for (const certName of certNames) {
    const safeName = assertSafeCertName(certName)
    const exists = await liveCertExists(safeName)

    if (exists && !overwriteSet.has(safeName)) {
      skipped.push(safeName)
      continue
    }

    const result = await importLiveCertPems(certName, folders[certName]!, {
      overwrite: exists,
    })
    if (!result.success) {
      throw createError({
        statusCode: 500,
        statusMessage: result.message || `Failed to import ${certName}`,
      })
    }
    imported.push(safeName)
  }

  if (!imported.length) {
    return {
      success: false,
      skipped,
      message: skipped.length
        ? 'No certificates selected — choose at least one overwrite or include new cert folders'
        : 'No certificates imported',
    }
  }

  const parts = [`Imported ${imported.length} certificate(s)`]
  if (skipped.length) {
    parts.push(`skipped ${skipped.length} existing`)
  }

  return {
    success: true,
    imported,
    skipped,
    message: `${parts.join('; ')} into live/`,
  }
}
