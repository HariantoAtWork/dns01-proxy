export type AccessRuleDirective = 'allow' | 'deny'

export interface AccessListRule {
  directive: AccessRuleDirective
  /** IPv4/IPv6 address or CIDR. */
  address: string
}

/** Stored user — password is always hashed on disk. */
export interface AccessListUser {
  username: string
  passwordHash: string
}

export interface AccessList {
  id: string
  name: string
  /** Pass if IP *or* Basic Auth matches (when both are configured). */
  satisfyAny: boolean
  /** Forward Authorization header to upstream when true. */
  passAuthUpstream: boolean
  users: AccessListUser[]
  rules: AccessListRule[]
}

export interface AccessListsFile {
  version: 1
  lists: AccessList[]
}

/** API / UI input — empty password keeps the existing hash on update. */
export interface AccessListUserInput {
  username: string
  password?: string
}

export type AccessListInput = Omit<AccessList, 'id' | 'users'> & {
  id?: string
  users: AccessListUserInput[]
}

/** Safe for UI — never includes passwordHash. */
export interface AccessListPublic {
  id: string
  name: string
  satisfyAny: boolean
  passAuthUpstream: boolean
  users: Array<{ username: string, passwordSet: boolean }>
  rules: AccessListRule[]
}

export interface ProxySettings {
  trustForwardedClientIp: boolean
}

export interface AccessDenyEntry {
  at: string
  ip: string
  hostId: string
  domain: string
  listId: string
  reason: string
}
