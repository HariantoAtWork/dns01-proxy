import { hashSync } from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import type { AcmeDnsConfig, AcmeTxtAccount, AcmeTxtPost } from './types'
import { generatePassword, sanitizeString, validCidrEntries, validKey } from './validation'
import { openSqlite, type SqliteDatabase } from './sqlite'
import { SHARED_MODE_USERNAME } from '../../plugins/client/runtime/shared/utils/tinyModeDns'

/** Let's Encrypt names-per-certificate cap; matches vendored Go server. */
export const TXT_RECORD_SLOTS = 100

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

    ensureTXTSlots()
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

function insertTXTSlots(database: SqliteDatabase, subdomain: string): void {
  const insert = database.prepare('INSERT INTO txt (Subdomain, LastUpdate) VALUES (?, 0)')
  for (let i = 0; i < TXT_RECORD_SLOTS; i++) {
    insert.run(subdomain)
  }
}

export function ensureTXTSlotsForSubdomain(subdomain: string): void {
  const database = requireDb()
  const key = sanitizeString(subdomain)
  if (!key) {
    return
  }
  const count = (database.prepare('SELECT COUNT(*) AS c FROM txt WHERE Subdomain = ?').get(key) as { c: number }).c
  if (count >= TXT_RECORD_SLOTS) {
    return
  }
  const insert = database.prepare('INSERT INTO txt (Subdomain, LastUpdate) VALUES (?, 0)')
  for (let i = count; i < TXT_RECORD_SLOTS; i++) {
    insert.run(key)
  }
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
  const database = requireDb()
  const rows = database.prepare('SELECT Subdomain FROM records').all() as Array<{ Subdomain: string }>
  const countStmt = database.prepare('SELECT COUNT(*) AS c FROM txt WHERE Subdomain = ?')
  const insert = database.prepare('INSERT INTO txt (Subdomain, LastUpdate) VALUES (?, 0)')

  let padded = 0
  let accounts = 0
  for (const row of rows) {
    const subdomain = row.Subdomain
    if (!subdomain) {
      continue
    }
    const count = (countStmt.get(subdomain) as { c: number }).c
    if (count >= TXT_RECORD_SLOTS) {
      continue
    }
    accounts++
    for (let i = count; i < TXT_RECORD_SLOTS; i++) {
      insert.run(subdomain)
      padded++
    }
  }
  if (padded > 0) {
    console.info(`[acmedns] padded ${padded} TXT slots across ${accounts} accounts`)
  }
}

export function registerAccount(allowfromInput: string[] = []): AcmeTxtAccount & { plaintextPassword: string } {
  const database = requireDb()
  const allowfrom = validCidrEntries(allowfromInput)
  const username = uuidv4()
  const plaintextPassword = generatePassword(40)
  const subdomain = uuidv4()
  const passwordHash = hashSync(plaintextPassword, 10)
  const allowJson = JSON.stringify(allowfrom)

  const tx = database.transaction(() => {
    database.prepare(`
      INSERT INTO records (Username, Password, Subdomain, AllowFrom)
      VALUES (?, ?, ?, ?)
    `).run(username, passwordHash, subdomain, allowJson)
    insertTXTSlots(database, subdomain)
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
  const database = requireDb()
  const subdomain = sanitizeString(domain)
  const rows = database.prepare(`
    SELECT Value FROM txt WHERE Subdomain = ? LIMIT ${TXT_RECORD_SLOTS}
  `).all(subdomain) as Array<{ Value: string }>
  return rows.map(row => row.Value ?? '')
}

export function updateTXT(post: AcmeTxtPost): boolean {
  const database = requireDb()
  const subdomain = sanitizeString(post.subdomain)
  ensureTXTSlotsForSubdomain(subdomain)
  const now = Math.floor(Date.now() / 1000)
  const result = database.prepare(`
    UPDATE txt SET Value = ?, LastUpdate = ?
    WHERE rowid = (
      SELECT rowid FROM txt WHERE Subdomain = ? ORDER BY LastUpdate LIMIT 1
    )
  `).run(post.txt, now, subdomain)
  return result.changes > 0
}
