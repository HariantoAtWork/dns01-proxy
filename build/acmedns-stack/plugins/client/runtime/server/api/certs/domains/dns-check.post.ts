import { parseDomainsText, readDomainsFile } from '../../../utils/domainsFile'
import { checkDomainsDns } from '../../../utils/domainsDnsCheck'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ text?: string }>(event)
  const parsed = typeof body?.text === 'string'
    ? parseDomainsText(body.text)
    : await readDomainsFile()

  if (!parsed.ok) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.errors.map(e => `Line ${e.line}: ${e.message}`).join('; '),
      data: parsed,
    })
  }

  const dnsChecks = await checkDomainsDns(parsed.lines)
  return { dnsChecks }
})
