import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export interface SqliteStatement {
  run: (...params: unknown[]) => unknown
  get: (...params: unknown[]) => unknown
  all: (...params: unknown[]) => unknown[]
}

export interface SqliteDatabase {
  exec: (sql: string) => void
  prepare: (sql: string) => SqliteStatement
  close: () => void
  transaction: <T>(fn: () => T) => () => T
}

async function openBunSqlite(path: string): Promise<SqliteDatabase> {
  const { Database } = await import('bun:sqlite')
  const db = new Database(path, { create: true })
  return {
    exec: (sql: string) => {
      db.exec(sql)
    },
    prepare: (sql: string) => {
      const stmt = db.prepare(sql)
      return {
        run: (...params: unknown[]) => stmt.run(...params),
        get: (...params: unknown[]) => stmt.get(...params),
        all: (...params: unknown[]) => stmt.all(...params) as unknown[],
      }
    },
    close: () => {
      db.close()
    },
    transaction: <T>(fn: () => T) => {
      const wrapped = db.transaction(fn)
      return () => wrapped() as T
    },
  }
}

async function openNodeSqlite(path: string): Promise<SqliteDatabase> {
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(path)
  return {
    exec: (sql: string) => {
      db.exec(sql)
    },
    prepare: (sql: string) => {
      const stmt = db.prepare(sql)
      return {
        run: (...params: unknown[]) => stmt.run(...params),
        get: (...params: unknown[]) => stmt.get(...params),
        all: (...params: unknown[]) => stmt.all(...params) as unknown[],
      }
    },
    close: () => {
      db.close()
    },
    transaction: <T>(fn: () => T) => {
      return () => {
        db.exec('BEGIN')
        try {
          const result = fn()
          db.exec('COMMIT')
          return result
        }
        catch (error) {
          db.exec('ROLLBACK')
          throw error
        }
      }
    },
  }
}

export async function openSqlite(path: string): Promise<SqliteDatabase> {
  mkdirSync(dirname(path), { recursive: true })
  if (typeof Bun !== 'undefined') {
    try {
      return await openBunSqlite(path)
    }
    catch {
      // Fall through to node:sqlite when bun:sqlite is unavailable in the loader.
    }
  }
  return openNodeSqlite(path)
}
