import type { H3Error } from 'h3'
import { createError, isError } from 'h3'
import { jsonError } from './validation'

export type AcmeDnsErrorCode =
  | 'forbidden'
  | 'invalid_username'
  | 'invalid_api_key'
  | 'account_not_found'
  | 'subdomain_mismatch'
  | 'ip_not_allowed'
  | 'bad_subdomain'
  | 'bad_txt'
  | 'subdomain_not_found'
  | 'db_error'

export function acmeDnsError(statusCode: number, code: AcmeDnsErrorCode) {
  return createError({
    statusCode,
    statusMessage: code,
    data: jsonError(code),
  })
}

export function isAcmeDnsError(error: unknown): error is H3Error<{ error: string }> {
  return isError(error) && typeof error.statusCode === 'number'
}

export function acmeDnsErrorCode(error: unknown): AcmeDnsErrorCode | null {
  if (!isAcmeDnsError(error)) {
    return null
  }
  const data = error.data as { error?: string } | undefined
  if (data?.error) {
    return data.error as AcmeDnsErrorCode
  }
  return (error.statusMessage as AcmeDnsErrorCode) || null
}
