import { dirname, join, resolve } from 'node:path'
import { promises as fs } from 'node:fs'
import type { LetsEncryptDirectoryMode } from '#shared/types/certs'

const PEM_NAMES = ['cert.pem', 'chain.pem', 'fullchain.pem', 'privkey.pem'] as const

export function getCertbotConfigDir() {
  const config = useRuntimeConfig()
  const envPath = process.env.CERTBOT_CONFIG_DIR
    || process.env.NUXT_CERTBOT_CONFIG_DIR
    || config.certbotConfigDir
    || '/etc/letsencrypt'

  if (envPath.startsWith('/')) {
    return envPath
  }
  return resolve(process.cwd(), envPath)
}

export function treeDirName(mode: LetsEncryptDirectoryMode) {
  return mode === 'staging' ? 'staging' : 'live'
}

export function certTreePath(mode: LetsEncryptDirectoryMode, certName: string) {
  return join(getCertbotConfigDir(), treeDirName(mode), certName)
}

export function trashTreePath(certName: string) {
  return join(getCertbotConfigDir(), 'trash', certName)
}

export function lastSavedTreePath(fromTree: 'live' | 'staging', certName: string) {
  return join(getCertbotConfigDir(), 'last-saved', fromTree, certName)
}

async function pathExists(path: string) {
  try {
    await fs.access(path)
    return true
  }
  catch {
    return false
  }
}

export async function listCertNamesInTree(tree: 'live' | 'staging' | 'trash') {
  const root = join(getCertbotConfigDir(), tree)
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    return entries.filter(e => e.isDirectory() && e.name !== 'README').map(e => e.name).sort()
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return []
    }
    throw error
  }
}

export async function listCertNamesInLastSaved(fromTree: 'live' | 'staging') {
  const root = join(getCertbotConfigDir(), 'last-saved', fromTree)
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    return entries.filter(e => e.isDirectory() && e.name !== 'README').map(e => e.name).sort()
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return []
    }
    throw error
  }
}

export async function readPem(path: string) {
  const real = await fs.realpath(path).catch(() => path)
  return fs.readFile(real, 'utf-8')
}

export async function writeLivePems(
  mode: LetsEncryptDirectoryMode,
  certName: string,
  files: { cert: string, chain: string, fullchain: string, privkey: string },
) {
  const dir = certTreePath(mode, certName)
  await fs.mkdir(dir, { recursive: true })

  const map = {
    'cert.pem': files.cert,
    'chain.pem': files.chain,
    'fullchain.pem': files.fullchain,
    'privkey.pem': files.privkey,
  } as const

  for (const [name, body] of Object.entries(map)) {
    const target = join(dir, name)
    // Replace Certbot symlinks with real files
    try {
      const st = await fs.lstat(target)
      if (st.isSymbolicLink()) {
        await fs.unlink(target)
      }
    }
    catch {
      // missing is fine
    }
    const tmp = `${target}.${process.pid}.tmp`
    await fs.writeFile(tmp, body, { encoding: 'utf-8', mode: 0o600 })
    await fs.rename(tmp, target)
    if (name === 'privkey.pem') {
      await fs.chmod(target, 0o600)
    }
  }
}

export async function removeCertTree(
  mode: LetsEncryptDirectoryMode | 'trash' | 'last-saved',
  certName: string,
  fromTree: 'live' | 'staging' = 'live',
) {
  const dir = mode === 'trash'
    ? trashTreePath(certName)
    : mode === 'last-saved'
      ? lastSavedTreePath(fromTree, certName)
      : certTreePath(mode, certName)
  await fs.rm(dir, { recursive: true, force: true })
}

export async function moveTree(from: string, to: string) {
  await fs.mkdir(dirname(to), { recursive: true })
  if (await pathExists(to)) {
    await fs.rm(to, { recursive: true, force: true })
  }
  await fs.rename(from, to)
}

export async function copyTree(from: string, to: string) {
  await fs.mkdir(dirname(to), { recursive: true })
  if (await pathExists(to)) {
    await fs.rm(to, { recursive: true, force: true })
  }
  await fs.cp(from, to, { recursive: true })
}

export { PEM_NAMES }
