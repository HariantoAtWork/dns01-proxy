import { TXT_RECORD_SLOTS } from '../../shared/txtTtlConstants'

export interface TxtSlot {
  value: string
  expiresAt: number
}

export interface InMemoryTxtStoreOptions {
  ttlSeconds: number
  now?: () => number
  slotCount?: number
}

function emptySlot(): TxtSlot {
  return { value: '', expiresAt: 0 }
}

export class InMemoryTxtStore {
  private readonly ttlMs: number
  private readonly now: () => number
  private readonly slotCount: number
  private readonly bySubdomain = new Map<string, TxtSlot[]>()

  constructor(options: InMemoryTxtStoreOptions) {
    this.ttlMs = options.ttlSeconds * 1000
    this.now = options.now ?? (() => Date.now())
    this.slotCount = options.slotCount ?? TXT_RECORD_SLOTS
  }

  private slotsFor(subdomain: string): TxtSlot[] {
    let slots = this.bySubdomain.get(subdomain)
    if (!slots) {
      slots = Array.from({ length: this.slotCount }, emptySlot)
      this.bySubdomain.set(subdomain, slots)
    }
    return slots
  }

  private purgeExpiredSlots(slots: TxtSlot[], now: number) {
    for (const slot of slots) {
      if (slot.value && slot.expiresAt <= now) {
        slot.value = ''
        slot.expiresAt = 0
      }
    }
  }

  private pickSlotIndex(slots: TxtSlot[], now: number): number {
    let emptyIdx = -1
    let oldestIdx = 0
    let oldestExpiry = Number.POSITIVE_INFINITY

    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i]!
      const empty = !slot.value || slot.expiresAt <= now
      if (empty) {
        if (emptyIdx < 0) {
          emptyIdx = i
        }
        continue
      }
      if (slot.expiresAt < oldestExpiry) {
        oldestExpiry = slot.expiresAt
        oldestIdx = i
      }
    }

    return emptyIdx >= 0 ? emptyIdx : oldestIdx
  }

  update(subdomain: string, txt: string): void {
    const now = this.now()
    const slots = this.slotsFor(subdomain)
    this.purgeExpiredSlots(slots, now)
    const index = this.pickSlotIndex(slots, now)
    slots[index] = { value: txt, expiresAt: now + this.ttlMs }
  }

  getValues(subdomain: string): string[] {
    const now = this.now()
    const slots = this.slotsFor(subdomain)
    const values: string[] = []
    for (const slot of slots) {
      if (slot.value && slot.expiresAt > now) {
        values.push(slot.value)
      }
    }
    return values
  }

  clearByValue(subdomain: string, txt: string): number {
    const slots = this.bySubdomain.get(subdomain)
    if (!slots) {
      return 0
    }
    let cleared = 0
    for (const slot of slots) {
      if (slot.value === txt) {
        slot.value = ''
        slot.expiresAt = 0
        cleared += 1
      }
    }
    return cleared
  }

  clearAll(subdomain: string): number {
    const slots = this.bySubdomain.get(subdomain)
    if (!slots) {
      return 0
    }
    let cleared = 0
    for (const slot of slots) {
      if (slot.value) {
        slot.value = ''
        slot.expiresAt = 0
        cleared += 1
      }
    }
    return cleared
  }

  purgeExpired(): number {
    const now = this.now()
    let purged = 0
    for (const slots of this.bySubdomain.values()) {
      for (const slot of slots) {
        if (slot.value && slot.expiresAt <= now) {
          slot.value = ''
          slot.expiresAt = 0
          purged += 1
        }
      }
    }
    return purged
  }
}
