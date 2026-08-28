import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { certTreePath, listCertNamesInTree, PEM_NAMES, readPem } from './letsencryptFs'
import { createZipStore } from './zipStore'

export function assertSafeCertName(name: string) {
  const decoded = decodeURIComponent(name)
  if (!decoded || /[/\\]/.test(decoded) || decoded.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid cert name' })
  }
  return decoded
}

async function readLiveCertPemBuffers(certName: string) {
  const safeName = assertSafeCertName(certName)
  const dir = certTreePath('production', safeName)

  try {
    await fs.access(join(dir, 'fullchain.pem'))
  }
  catch {
    throw createError({
      statusCode: 404,
      statusMessage: `No production certificate at live/${safeName}`,
    })
  }

  const files: Record<string, Buffer> = {}
  for (const pemName of PEM_NAMES) {
    const path = join(dir, pemName)
    try {
      files[pemName] = Buffer.from(await readPem(path), 'utf8')
    }
    catch {
      throw createError({
        statusCode: 404,
        statusMessage: `Missing ${pemName} for live/${safeName}`,
      })
    }
  }

  return { safeName, files }
}

export async function buildLiveCertZip(certName: string) {
  const { safeName, files } = await readLiveCertPemBuffers(certName)
  return {
    buffer: createZipStore(files),
    filename: `${safeName}-live.zip`,
  }
}

export async function buildLiveCertsBatchZip(certNames?: string[]) {
  const names = certNames?.length
    ? certNames.map(name => assertSafeCertName(name))
    : await listCertNamesInTree('live')

  if (!names.length) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No production certificates in live/',
    })
  }

  const files: Record<string, Buffer> = {}
  for (const name of names) {
    const { safeName, files: pems } = await readLiveCertPemBuffers(name)
    for (const pemName of PEM_NAMES) {
      files[`${safeName}/${pemName}`] = pems[pemName]!
    }
  }

  return {
    buffer: createZipStore(files),
    filename: 'live-certificates.zip',
    certNames: names,
  }
}
