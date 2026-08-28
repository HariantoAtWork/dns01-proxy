import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { assertSafeCertName } from './certDownload'
import { snapshotCertToLastSaved } from './certLastSaved'
import { PEM_NAMES, certTreePath, writeLivePems } from './letsencryptFs'
import { parseZipStore } from './zipStore'

const MAX_ZIP_BYTES = 2 * 1024 * 1024

import type { CertUploadResult } from '#shared/types/certs'
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

export async function importLiveCertZip(
  certName: string,
  zipBuffer: Buffer,
  options?: { overwrite?: boolean },
): Promise<CertUploadResult> {
  const safeName = assertSafeCertName(certName)

  if (!zipBuffer.length) {
    throw createError({ statusCode: 400, statusMessage: 'ZIP file is empty' })
  }
  if (zipBuffer.length > MAX_ZIP_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'ZIP file is larger than 2 MiB' })
  }

  const exists = await liveCertExists(safeName)
  if (exists && !options?.overwrite) {
    return {
      success: false,
      needsOverwrite: true,
      message: `live/${safeName} already exists — upload again with overwrite to replace it`,
    }
  }

  const entries = parseZipStore(zipBuffer)
  for (const pemName of PEM_NAMES) {
    if (!entries[pemName]?.length) {
      throw createError({
        statusCode: 400,
        statusMessage: `ZIP is missing ${pemName}`,
      })
    }
  }

  const cert = entries['cert.pem']!.toString('utf8')
  const chain = entries['chain.pem']!.toString('utf8')
  const fullchain = entries['fullchain.pem']!.toString('utf8')
  const privkey = entries['privkey.pem']!.toString('utf8')

  assertPemBody(cert, 'CERTIFICATE', 'cert.pem')
  assertPemBody(chain, 'CERTIFICATE', 'chain.pem')
  assertPemBody(fullchain, 'CERTIFICATE', 'fullchain.pem')
  assertPemBody(privkey, 'PRIVATE KEY', 'privkey.pem')

  if (exists) {
    await snapshotCertToLastSaved('production', safeName)
  }

  await writeLivePems('production', safeName, {
    cert,
    chain,
    fullchain,
    privkey,
  })

  return {
    success: true,
    message: exists
      ? `Replaced live/${safeName} from ZIP`
      : `Imported live/${safeName} from ZIP`,
  }
}
