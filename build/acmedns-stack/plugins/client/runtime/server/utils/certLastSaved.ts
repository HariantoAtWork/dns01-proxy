import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import type { LastSavedItem, LetsEncryptDirectoryMode } from '#shared/types/certs'
import {
  certTreePath,
  copyTree,
  lastSavedTreePath,
  listCertNamesInLastSaved,
  moveTree,
  removeCertTree,
  treeDirName,
} from './letsencryptFs'
import { readCertMeta } from './certStatus'

const META = 'last-saved-meta.json'

async function writeMeta(fromTree: 'live' | 'staging', certName: string, item: LastSavedItem) {
  const path = join(lastSavedTreePath(fromTree, certName), META)
  await fs.writeFile(path, `${JSON.stringify(item, null, 2)}\n`, 'utf-8')
}

async function readMeta(fromTree: 'live' | 'staging', certName: string): Promise<LastSavedItem | null> {
  try {
    const raw = await fs.readFile(join(lastSavedTreePath(fromTree, certName), META), 'utf-8')
    return JSON.parse(raw) as LastSavedItem
  }
  catch {
    return null
  }
}

export async function listLastSaved(): Promise<LastSavedItem[]> {
  const items: LastSavedItem[] = []
  for (const fromTree of ['live', 'staging'] as const) {
    const names = await listCertNamesInLastSaved(fromTree)
    const metaMode = fromTree === 'staging' ? 'last-saved-staging' : 'last-saved-live'
    for (const certName of names) {
      const meta = await readMeta(fromTree, certName)
      const certMeta = await readCertMeta(metaMode, certName)
      items.push(meta ?? {
        certName,
        savedAt: new Date(0).toISOString(),
        fromTree,
        notAfter: certMeta?.notAfter,
      })
    }
  }
  return items.sort((a, b) => {
    const byTime = b.savedAt.localeCompare(a.savedAt)
    if (byTime !== 0) {
      return byTime
    }
    const byName = a.certName.localeCompare(b.certName)
    if (byName !== 0) {
      return byName
    }
    return a.fromTree.localeCompare(b.fromTree)
  })
}

/** Copy existing live/staging PEMs into last-saved before a replace. No-op if none yet. */
export async function snapshotCertToLastSaved(
  mode: LetsEncryptDirectoryMode,
  certName: string,
) {
  const fromTree = treeDirName(mode)
  const from = certTreePath(mode, certName)
  try {
    await fs.access(join(from, 'fullchain.pem'))
  }
  catch {
    return
  }

  const certMeta = await readCertMeta(mode, certName)
  const to = lastSavedTreePath(fromTree, certName)
  await copyTree(from, to)
  try {
    await fs.unlink(join(to, META))
  }
  catch {
    // ok
  }
  await writeMeta(fromTree, certName, {
    certName,
    savedAt: new Date().toISOString(),
    fromTree,
    notAfter: certMeta?.notAfter,
  })
}

export async function restoreCertFromLastSaved(
  certName: string,
  fromTree: 'live' | 'staging',
) {
  const from = lastSavedTreePath(fromTree, certName)
  const to = certTreePath(fromTree === 'staging' ? 'staging' : 'production', certName)
  try {
    await fs.access(join(from, 'fullchain.pem'))
  }
  catch {
    throw createError({
      statusCode: 404,
      statusMessage: `Nothing in last-saved for ${fromTree}/${certName}`,
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

export async function permanentDeleteLastSaved(
  certName: string,
  fromTree: 'live' | 'staging',
) {
  const from = lastSavedTreePath(fromTree, certName)
  try {
    await fs.access(from)
  }
  catch {
    throw createError({
      statusCode: 404,
      statusMessage: `Nothing in last-saved for ${fromTree}/${certName}`,
    })
  }
  await removeCertTree('last-saved', certName, fromTree)
}
