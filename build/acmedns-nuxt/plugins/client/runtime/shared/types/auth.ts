export const ADMIN_USERNAME = 'admin'

export interface AuthSession {
  restrictMode: boolean
  authenticated: boolean
}

export interface AuthLoginBody {
  username?: string
  password?: string
}

export interface AuthLoginResult {
  ok: true
  restrictMode: boolean
}
