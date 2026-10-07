import { resolveTxtTtlSeconds } from '../../plugins/txt-ttl/runtime/shared/txtTtlConstants'
import { InMemoryAliasStore } from '../store/inMemoryAliasStore'

export interface AliasStore {
  mint(entryLabel: string, hopLabel: string): void
  getTarget(entryLabel: string): string | null
  clear(entryLabel: string): boolean
  purgeExpired(): number
}

let store: AliasStore | null = null

export function registerAliasStore(next: AliasStore): void {
  store = next
}

export function resetAliasStore(): void {
  store = null
}

export function ensureAliasStoreReady(): AliasStore {
  if (!store) {
    store = new InMemoryAliasStore({ ttlSeconds: () => resolveTxtTtlSeconds() })
    console.info(
      `[auth-hop] in-memory alias store ready (lifetime ${resolveTxtTtlSeconds()}s = settle + hold)`,
    )
  }
  return store
}

export function requireAliasStore(): AliasStore {
  return ensureAliasStoreReady()
}
