export interface AuthHopAlias {
  entryLabel: string
  hopLabel: string
  expiresAt: number
}

export interface InMemoryAliasStoreOptions {
  /** Fixed seconds, or a getter so settle+hold overrides apply on mint. */
  ttlSeconds: number | (() => number)
  now?: () => number
}

/**
 * One dynamic CNAME alias per entry label (encoded apex).
 * Reminting overwrites the previous hop for that entry.
 */
export class InMemoryAliasStore {
  private readonly ttlSeconds: number | (() => number)
  private readonly now: () => number
  private readonly byEntry = new Map<string, AuthHopAlias>()

  constructor(options: InMemoryAliasStoreOptions) {
    this.ttlSeconds = options.ttlSeconds
    this.now = options.now ?? (() => Date.now())
  }

  private ttlMs(): number {
    const seconds = typeof this.ttlSeconds === 'function' ? this.ttlSeconds() : this.ttlSeconds
    return Math.max(1, seconds) * 1000
  }

  mint(entryLabel: string, hopLabel: string): void {
    const key = entryLabel.toLowerCase()
    const hop = hopLabel.toLowerCase()
    const now = this.now()
    this.byEntry.set(key, {
      entryLabel: key,
      hopLabel: hop,
      expiresAt: now + this.ttlMs(),
    })
  }

  getTarget(entryLabel: string): string | null {
    const key = entryLabel.toLowerCase()
    const alias = this.byEntry.get(key)
    if (!alias) {
      return null
    }
    if (alias.expiresAt <= this.now()) {
      this.byEntry.delete(key)
      return null
    }
    return alias.hopLabel
  }

  clear(entryLabel: string): boolean {
    return this.byEntry.delete(entryLabel.toLowerCase())
  }

  purgeExpired(): number {
    const now = this.now()
    let purged = 0
    for (const [key, alias] of this.byEntry) {
      if (alias.expiresAt <= now) {
        this.byEntry.delete(key)
        purged += 1
      }
    }
    return purged
  }
}
