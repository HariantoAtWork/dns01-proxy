import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import type { TrashItem } from '#shared/types/certs'
import {
  certTreePath,
  listCertNamesInTree,
  moveTree,
  removeCertTree,
  trashTreePath,
} from './letsencryptFs'
import { readCertMeta } from './certStatus'

const META = 'trash-meta.json'

async function writeMeta(certName: string, item: TrashItem) {
  const path = join(trashTreePath(certName), META)
  await fs.writeFile(path, `${JSON.stringify(item, null, 2)}\n`, 'utf-8')
}

async function readMeta(certName: string): Promise<TrashItem | null> {
  try {
    const raw = await fs.readFile(join(trashTreePath(certName), META), 'utf-8')
    return JSON.parse(raw) as TrashItem
  }
  catch {
    return null
  }
}

export async function listTrash(): Promise<TrashItem[]> {
  const names = await listCertNamesInTree('trash')
  const items: TrashItem[] = []
  for (const certName of names) {
    const meta = await readMeta(certName)
    const certMeta = await readCertMeta('trash', certName)
    items.push(meta ?? {
      certName,
      trashedAt: new Date(0).toISOString(),
      fromTree: 'live',
      notAfter: certMeta?.notAfter,
    })
  }
  return items.sort((a, b) => b.trashedAt.localeCompare(a.trashedAt))
}

export async function moveCertToTrash(certName: string, fromTree: 'live' | 'staging') {
  const from = certTreePath(fromTree === 'staging' ? 'staging' : 'production', certName)
  const to = trashTreePath(certName)
  try {
    await fs.access(join(from, 'fullchain.pem'))
  }
  catch {
    throw createError({
      statusCode: 404,
      statusMessage: `No certificate at ${fromTree}/${certName}`,
    })
  }
  const certMeta = await readCertMeta(fromTree === 'staging' ? 'staging' : 'production', certName)
  await moveTree(from, to)
  await writeMeta(certName, {
    certName,
    trashedAt: new Date().toISOString(),
    fromTree,
    notAfter: certMeta?.notAfter,
  })
}

export async function restoreCertFromTrash(certName: string) {
  const meta = await readMeta(certName)
  const fromTree = meta?.fromTree ?? 'live'
  const from = trashTreePath(certName)
  const to = certTreePath(fromTree === 'staging' ? 'staging' : 'production', certName)
  try {
    await fs.access(from)
  }
  catch {
    throw createError({
      statusCode: 404,
      statusMessage: `Nothing in trash for ${certName}`,
    })
  }
  await moveTree(from, to)
  try {
    await fs.unlink(join(to, META))
  }
  catch {
    // ok
  }
}

export async function permanentDeleteTrash(certName: string) {
  const from = trashTreePath(certName)
  try {
    await fs.access(from)
  }
  catch {
    throw createError({
      statusCode: 404,
      statusMessage: `Nothing in trash for ${certName}`,
    })
  }
  await removeCertTree('trash', certName)
}
