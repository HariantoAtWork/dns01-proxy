/** Stored key — token is hashed on disk; plaintext shown once on create/rotate. */
export interface BearerKey {
  id: string
  name: string
  /** SHA-256 hex of the plaintext token. */
  tokenHash: string
  /** Short display prefix of the plaintext token (e.g. sk_ab12…). */
  prefix: string
  createdAt: string
  updatedAt: string
}

export interface BearerKeysFile {
  version: 1
  keys: BearerKey[]
}

/** API / UI input — name only; token is always generated server-side. */
export interface BearerKeyInput {
  id?: string
  name: string
}

/** Safe for UI — never includes tokenHash. */
export interface BearerKeyPublic {
  id: string
  name: string
  prefix: string
  createdAt: string
  updatedAt: string
}

/** Create / rotate response — includes plaintext token once. */
export interface BearerKeyCreated extends BearerKeyPublic {
  token: string
}
