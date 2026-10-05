/**
 * Barrel: acme-dns client helpers (routing, register, TXT, verify).
 * Prefer importing from here so existing consumers stay stable.
 */
export {
  isInProcessAcmeDnsPublish,
  resolveAcmeDnsBase,
} from './acmednsRouting'

export { registerAcmeDnsAccount } from './acmednsRegister'

export {
  clearAcmeDnsTxt,
  isLocalInProcessAcmeDns,
  purgeAcmeDnsTxtSlots,
  updateAcmeDnsTxt,
} from './acmednsTxt'

export type {
  AcmeDnsAccountVerifyResult,
  AcmeDnsAccountVerifyStatus,
} from './acmednsVerify'

export {
  verifyAcmeDnsCredentials,
  verifyAcmeDnsStorageAccounts,
} from './acmednsVerify'
