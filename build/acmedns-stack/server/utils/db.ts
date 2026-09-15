import { hashSync } from 'bcryptjs'
import { v7 as uuid } from 'uuid'
import type { AcmeDnsConfig, AcmeTxtAccount, AcmeTxtPost } from './types'
import { generatePassword, sanitizeString, validCidrEntries, validKey } from './validation'
import { openSqlite, type SqliteDatabase } from './sqlite'
import { SHARED_MODE_USERNAME } from '../../plugins/client/runtime/shared/utils/tinyModeDns'
import { ensureTxtStoreReady, requireTxtStore } from './txtStoreRegistry'
import { TXT_RECORD_SLOTS } from '../../plugins/txt-ttl/runtime/shared/txtTtlConstants'

export { TXT_RECORD_SLOTS }

const DB_VERSION = 1

let db: SqliteDatabase | null = null
let initPromise: Promise<void> | null = null

function requireDb(): SqliteDatabase {
  if (!db) {
    throw new Error('database not initialised')
  }
  return db
}

export async function initAcmeDb(config: AcmeDnsConfig): Promise<void> {
  if (db) {
    return
  }
  if (initPromise) {
    await initPromise
    return
  }

  initPromise = (async () => {
    const connection = config.database.connection
    db = await openSqlite(connection)
    db.exec('PRAGMA journal_mode = WAL;')

    db.exec(`
      CREATE TABLE IF NOT EXISTS acmedns(
        Name TEXT,
        Value TEXT
      );
    `)
    db.exec(`
      CREATE TABLE IF NOT EXISTS records(
        Username TEXT UNIQUE NOT NULL PRIMARY KEY,
        Password TEXT UNIQUE NOT NULL,
        Subdomain TEXT UNIQUE NOT NULL,
        AllowFrom TEXT
      );
    `)
    db.exec(`
      CREATE TABLE IF NOT EXISTS txt(
        Subdomain TEXT NOT NULL,
        Value TEXT NOT NULL DEFAULT '',
        LastUpdate INT
      );
    `)

    const versionRow = db.prepare("SELECT Value FROM acmedns WHERE Name='db_version'").get() as { Value?: string } | null
    let versionString = versionRow?.Value ?? ''
    if (!versionString) {
      versionString = '0'
    }

    if (versionString === '0') {
      db.exec(`INSERT INTO acmedns (Name, Value) VALUES ('db_version', '${DB_VERSION}')`)
    }

    ensureTxtStoreReady()
    console.info(`[acmedns] connected to sqlite at ${connection}`)
  })()

  try {
    await initPromise
  }
  finally {
    initPromise = null
  }
}

export function closeAcmeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function ensureTXTSlotsForSubdomain(subdomain: string): void {
  if (!sanitizeString(subdomain)) {
    return
  }
  ensureTxtStoreReady()
}

function readAcmeMeta(name: string): string {
  const database = requireDb()
  const row = database.prepare('SELECT Value FROM acmedns WHERE Name = ? LIMIT 1').get(name) as { Value?: string } | null
  return row?.Value ?? ''
}

function writeAcmeMeta(name: string, value: string): void {
  const database = requireDb()
  const row = database.prepare('SELECT rowid FROM acmedns WHERE Name = ? LIMIT 1').get(name) as { rowid?: number } | null
  if (row?.rowid) {
    database.prepare('UPDATE acmedns SET Value = ? WHERE Name = ?').run(value, name)
  }
  else {
    database.prepare('INSERT INTO acmedns (Name, Value) VALUES (?, ?)').run(name, value)
  }
}

export function getSharedPlaintextPassword(): string {
  const stored = readAcmeMeta('shared_password')
  return validKey(stored) ? stored : ''
}

/**
 * Create or refresh the shared-mode account row.
 * Returns plaintext password (generated when none supplied).
 */
export function upsertSharedAccount(
  username: string,
  subdomain: string,
  plaintextPassword?: string,
): string {
  const database = requireDb()
  const user = sanitizeString(username) || SHARED_MODE_USERNAME
  const sub = sanitizeString(subdomain)
  if (!sub) {
    throw new Error('shared account requires a subdomain key')
  }

  let password = (plaintextPassword || '').trim()
  if (!validKey(password)) {
    password = getSharedPlaintextPassword() || generatePassword(40)
  }
  writeAcmeMeta('shared_password', password)

  const passwordHash = hashSync(password, 10)
  const existing = getByUsername(user)

  const tx = database.transaction(() => {
    if (existing) {
      database.prepare(`
        UPDATE records SET Password = ?, Subdomain = ?, AllowFrom = ?
        WHERE Username = ?
      `).run(passwordHash, sub, '[]', user)
    }
    else {
      database.prepare(`
        INSERT INTO records (Username, Password, Subdomain, AllowFrom)
        VALUES (?, ?, ?, ?)
      `).run(user, passwordHash, sub, '[]')
    }
    ensureTXTSlotsForSubdomain(sub)
  })
  tx()

  return password
}

function ensureTXTSlots(): void {
  ensureTxtStoreReady()
}

export function registerAccount(allowfromInput: string[] = []): AcmeTxtAccount & { plaintextPassword: string } {
  const database = requireDb()
  const allowfrom = validCidrEntries(allowfromInput)
  const username = uuid()
  const plaintextPassword = generatePassword(40)
  const subdomain = uuid()
  const passwordHash = hashSync(plaintextPassword, 10)
  const allowJson = JSON.stringify(allowfrom)

  const tx = database.transaction(() => {
    database.prepare(`
      INSERT INTO records (Username, Password, Subdomain, AllowFrom)
      VALUES (?, ?, ?, ?)
    `).run(username, passwordHash, subdomain, allowJson)
    ensureTXTSlotsForSubdomain(subdomain)
  })
  tx()

  return {
    username,
    password: passwordHash,
    plaintextPassword,
    subdomain,
    allowfrom,
  }
}

export function getByUsername(username: string): AcmeTxtAccount | null {
  const database = requireDb()
  const row = database.prepare(`
    SELECT Username, Password, Subdomain, AllowFrom
    FROM records
    WHERE Username = ?
    LIMIT 1
  `).get(username) as {
    Username: string
    Password: string
    Subdomain: string
    AllowFrom: string
  } | null

  if (!row) {
    return null
  }

  let allowfrom: string[] = []
  try {
    const parsed = JSON.parse(row.AllowFrom || '[]') as unknown
    if (Array.isArray(parsed)) {
      allowfrom = parsed.filter((item): item is string => typeof item === 'string')
    }
  }
  catch {
    allowfrom = []
  }

  return {
    username: row.Username,
    password: row.Password,
    subdomain: row.Subdomain,
    allowfrom,
  }
}

export function getTXTForDomain(domain: string): string[] {
  const subdomain = sanitizeString(domain)
  if (!subdomain) {
    return []
  }
  return requireTxtStore().getValues(subdomain)
}

export function updateTXT(post: AcmeTxtPost): boolean {
  const subdomain = sanitizeString(post.subdomain)
  if (!subdomain) {
    return false
  }
  ensureTXTSlotsForSubdomain(subdomain)
  requireTxtStore().update(subdomain, post.txt)
  return true
}

export function clearTxtByValue(subdomain: string, txt: string): number {
  const key = sanitizeString(subdomain)
  if (!key) {
    return 0
  }
  return requireTxtStore().clearByValue(key, txt)
}

export function clearAllTxtForSubdomain(subdomain: string): number {
  const key = sanitizeString(subdomain)
  if (!key) {
    return 0
  }
  return requireTxtStore().clearAll(key)
}
