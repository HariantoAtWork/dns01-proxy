/** One token entry inside a Bearer List. */
export interface BearerListKey {
  id: string
  /** SHA-256 hex of the plaintext token (edge verify). */
  tokenHash: string
  /** Plaintext for operator UI redisplay (control plane only). */
  token: string
  /** Short display prefix (e.g. sk_ab12…). */
  prefix: string
  createdAt: string
  updatedAt: string
}

export interface BearerList {
  id: string
  name: string
  keys: BearerListKey[]
}

export interface BearerListsFile {
  version: 1
  lists: BearerList[]
}

/** API / UI key row — empty token on create = auto-generate; empty on update = keep. */
export interface BearerListKeyInput {
  id?: string
  token?: string
}

export interface BearerListInput {
  id?: string
  name: string
  keys: BearerListKeyInput[]
}

export interface BearerListKeyPublic {
  id: string
  prefix: string
  /** Full token for operator edit UI (plain text). */
  token: string
  tokenSet: boolean
  createdAt: string
  updatedAt: string
}

export interface BearerListPublic {
  id: string
  name: string
  keys: BearerListKeyPublic[]
}

/** Newly minted plaintext tokens returned once after save. */
export interface BearerGeneratedToken {
  keyId: string
  token: string
}
