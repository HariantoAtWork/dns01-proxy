import { InMemoryTxtStore } from '../../plugins/txt-ttl/runtime/server/store/inMemoryTxtStore'
import { resolveTxtTtlSeconds } from '../../plugins/txt-ttl/runtime/shared/txtTtlConstants'

export interface TxtStore {
  update(subdomain: string, txt: string): void
  getValues(subdomain: string): string[]
  clearByValue(subdomain: string, txt: string): number
  clearAll(subdomain: string): number
  purgeExpired(): number
}

let store: TxtStore | null = null

export function registerTxtStore(next: TxtStore): void {
  store = next
}

export function resetTxtStore(): void {
  store = null
}

export function ensureTxtStoreReady(): TxtStore {
  if (!store) {
    const ttlSeconds = resolveTxtTtlSeconds()
    store = new InMemoryTxtStore({ ttlSeconds })
    console.info(`[txt-ttl] in-memory TXT store ready (TTL ${ttlSeconds}s)`)
  }
  return store
}

export function requireTxtStore(): TxtStore {
  return ensureTxtStoreReady()
}
