import type { CertApplyResult, LetsEncryptDirectoryMode } from '#shared/types/certs'
import { readDomainsFile } from './domainsFile'
import { issueCertificate } from './acmeIssue'
import { isAcmeEnabled } from './certSettings'
import { withCertJobLock } from './certJobLock'
import { buildCertStatus, needsRenewal, readCertMeta } from './certStatus'

export async function applyCertificates(options: {
  mode: LetsEncryptDirectoryMode
  certNames?: string[]
  force?: boolean
  renewOnly?: boolean
}): Promise<CertApplyResult[]> {
  if (!isAcmeEnabled()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Certificate ACME is disabled (CERTS_ACME_ENABLED=false).',
    })
  }

  return withCertJobLock(async () => {
    const domains = await readDomainsFile()
    if (!domains.ok) {
      throw createError({
        statusCode: 400,
        statusMessage: 'domains.txt has validation errors. Fix and save first.',
      })
    }

    const wanted = options.certNames?.length
      ? domains.lines.filter(l => options.certNames!.includes(l.certName))
      : domains.lines

    const results: CertApplyResult[] = []

    for (const line of wanted) {
      const meta = await readCertMeta(options.mode, line.certName)
      const status = (await buildCertStatus(options.mode)).find(s => s.certName === line.certName)
      const missing = !meta
      const drift = status?.status === 'drift'
      const due = meta ? needsRenewal(meta.notAfter) : true

      if (options.renewOnly) {
        if (!meta || !due) {
          results.push({
            certName: line.certName,
            ok: true,
            message: meta ? 'Not due for renewal' : 'No certificate to renew',
            notAfter: meta?.notAfter,
          })
          continue
        }
      }
      else if (!options.force && !missing && !drift) {
        results.push({
          certName: line.certName,
          ok: true,
          message: 'Up to date',
          notAfter: meta?.notAfter,
        })
        continue
      }

      try {
        await issueCertificate({
          mode: options.mode,
          certName: line.certName,
          altNames: line.expanded,
        })
        const after = await readCertMeta(options.mode, line.certName)
        results.push({
          certName: line.certName,
          ok: true,
          message: missing ? 'Issued' : drift ? 'Re-issued (SAN change)' : 'Renewed',
          notAfter: after?.notAfter,
        })
      }
      catch (error) {
        const message = error instanceof Error ? error.message : 'Issue failed'
        results.push({
          certName: line.certName,
          ok: false,
          message,
        })
      }
    }

    return results
  })
}
