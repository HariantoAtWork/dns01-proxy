import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { ADMIN_USERNAME } from '#shared/types/auth'

export const SESSION_COOKIE = 'acmedns_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7
const SESSION_KEY_PREFIX = 'acmedns-admin-session:'

export function getAdministratorPassword(event: H3Event): string {
  const config = useRuntimeConfig(event)
  const raw = process.env.ADMINISTRATOR_PASSWORD
    || process.env.NUXT_ADMINISTRATOR_PASSWORD
    || config.administratorPassword
    || ''

  return String(raw).trim()
}

export function isRestrictMode(event: H3Event): boolean {
  return getAdministratorPassword(event).length > 0
}

export function timingSafeEqualString(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left).digest()
  const rightHash = createHash('sha256').update(right).digest()
  return timingSafeEqual(leftHash, rightHash)
}

function signingKey(password: string): Buffer {
  return createHash('sha256').update(`${SESSION_KEY_PREFIX}${password}`).digest()
}

function signPayload(payload: string, password: string): string {
  return createHmac('sha256', signingKey(password)).update(payload).digest('base64url')
}

function hmacEqual(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left)
  const rightBuf = Buffer.from(right)
  if (leftBuf.length !== rightBuf.length) {
    return false
  }
  return timingSafeEqual(leftBuf, rightBuf)
}

export function createSessionToken(password: string): string {
  const exp = Date.now() + SESSION_MAX_AGE_SECONDS * 1000
  const nonce = randomBytes(16).toString('base64url')
  const payload = `${exp}.${nonce}`
  return `${payload}.${signPayload(payload, password)}`
}

export function verifySessionToken(token: string, password: string): boolean {
  const parts = token.split('.')
  if (parts.length !== 3) {
    return false
  }

  const [expRaw, nonce, mac] = parts
  if (!expRaw || !nonce || !mac) {
    return false
  }

  const payload = `${expRaw}.${nonce}`
  const expected = signPayload(payload, password)
  if (!hmacEqual(mac, expected)) {
    return false
  }

  const exp = Number(expRaw)
  return Number.isFinite(exp) && exp >= Date.now()
}

function isSecureRequest(event: H3Event): boolean {
  const forwarded = getRequestHeader(event, 'x-forwarded-proto')
  if (typeof forwarded === 'string' && forwarded.split(',')[0]?.trim() === 'https') {
    return true
  }
  return getRequestProtocol(event) === 'https'
}

function cookieOptions(event: H3Event) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isSecureRequest(event),
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  }
}

export function setSessionCookie(event: H3Event, token: string) {
  setCookie(event, SESSION_COOKIE, token, cookieOptions(event))
}

export function clearSessionCookie(event: H3Event) {
  deleteCookie(event, SESSION_COOKIE, cookieOptions(event))
}

export function isAuthenticated(event: H3Event): boolean {
  if (!isRestrictMode(event)) {
    return false
  }

  const token = getCookie(event, SESSION_COOKIE)
  if (!token) {
    return false
  }

  return verifySessionToken(token, getAdministratorPassword(event))
}

export function requireAdministrator(event: H3Event) {
  if (!isRestrictMode(event) || isAuthenticated(event)) {
    return
  }

  throw createError({
    statusCode: 401,
    statusMessage: 'Unauthorised',
    message: 'Authentication required',
  })
}

export function credentialsMatch(username: string, password: string, expectedPassword: string): boolean {
  const usernameOk = timingSafeEqualString(username, ADMIN_USERNAME)
  const passwordOk = timingSafeEqualString(password, expectedPassword)
  return usernameOk && passwordOk
}
