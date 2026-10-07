declare module 'bun:sqlite' {
  export class Database {
    constructor(path: string, options?: { create?: boolean })
    exec(sql: string): void
    prepare(sql: string): {
      run: (...params: unknown[]) => unknown
      get: (...params: unknown[]) => unknown
      all: (...params: unknown[]) => unknown[]
    }
    close(): void
    transaction<T>(fn: () => T): () => T
  }
}

declare module 'nitropack/runtime/internal' {
  export function startScheduleRunner(): void
}
