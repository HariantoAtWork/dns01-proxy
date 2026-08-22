import { hashSync } from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import type { AcmeDnsConfig, AcmeTxtAccount, AcmeTxtPost } from './types'
import { generatePassword, sanitizeString, validCidrEntries } from './validation'
import { openSqlite, type SqliteDatabase } from './sqlite'

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
  const now = Math.floor(Date.now() / 1000)
  const result = database.prepare(`
    UPDATE txt SET Value = ?, LastUpdate = ?
    WHERE rowid = (
      SELECT rowid FROM txt WHERE Subdomain = ? ORDER BY LastUpdate LIMIT 1
    )
  `).run(post.txt, now, post.subdomain)
  return result.changes > 0
}
