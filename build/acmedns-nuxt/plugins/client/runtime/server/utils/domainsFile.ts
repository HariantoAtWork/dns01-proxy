import { dirname, resolve } from 'node:path'
import { promises as fs } from 'node:fs'
import {
  expandLine,
  isValidDomainName,
  lineApex,
} from '#shared/utils/domains'
import type {
  DomainsLineError,
  DomainsParseResult,
  ParsedDomainsLine,
} from '#shared/types/certs'
import { checkDomainsDns } from './domainsDnsCheck'

const COMMENT_LINE = /^\s*[#;]/

export function getDomainsFilePath() {
  const config = useRuntimeConfig()
  const envPath = process.env.DOMAINS_FILE
    || process.env.NUXT_DOMAINS_FILE
    || config.domainsFile
    || 'config/host/domains.txt'

  if (envPath.startsWith('/')) {
    return envPath
  }
  return resolve(process.cwd(), envPath)
}

export async function ensureDomainsFileExists() {
  const filePath = getDomainsFilePath()
  try {
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) {
      throw createError({
        statusCode: 500,
        statusMessage: `${filePath} is a directory. Remove it and use a file named domains.txt.`,
      })
    }
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      await fs.mkdir(dirname(filePath), { recursive: true })
      const starter = [
        '# One certificate per line. Space- or comma-separated names.',
        '# Nested wildcards imply parent wildcards. Order does not matter.',
        '# Example: mdstn.com *.mdstn.com *.oib.mdstn.com',
        '',
      ].join('\n')
      await fs.writeFile(filePath, starter, 'utf-8')
      return filePath
    }
    throw error
  }
  return filePath
}

export function parseDomainsText(text: string): DomainsParseResult {
  const errors: DomainsLineError[] = []
  const lines: ParsedDomainsLine[] = []
  const rawLines = text.replace(/\r\n/g, '\n').split('\n')

  rawLines.forEach((raw, index) => {
    const lineNo = index + 1
    if (!raw.trim() || COMMENT_LINE.test(raw)) {
      return
    }

    let body = raw
    const hash = body.indexOf('#')
    if (hash >= 0) {
      body = body.slice(0, hash)
    }
    body = body.replace(/,/g, ' ').trim()
    if (!body) {
      return
    }

    const names = body.split(/\s+/).filter(Boolean)
    if (names.length === 0) {
      return
    }

    const valid: string[] = []
    for (const name of names) {
      if (!isValidDomainName(name)) {
        errors.push({
          line: lineNo,
          message: `Invalid domain name: ${name}`,
        })
        continue
      }
      valid.push(name)
    }

    if (valid.length === 0) {
      return
    }

    const certName = lineApex(valid)
    const expanded = expandLine(valid)
    lines.push({
      line: lineNo,
      names: valid,
      certName,
      expanded,
      raw: raw.trimEnd(),
    })
  })

  return {
    ok: errors.length === 0,
    text,
    lines,
    errors,
  }
}

export async function readDomainsFile(): Promise<DomainsParseResult> {
  const filePath = await ensureDomainsFileExists()
  const text = await fs.readFile(filePath, 'utf-8')
  return parseDomainsText(text)
}

export async function writeDomainsFile(text: string): Promise<DomainsParseResult> {
  const parsed = parseDomainsText(text)
  if (!parsed.ok) {
    return parsed
  }

  const filePath = await ensureDomainsFileExists()
  const dir = dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmp = `${filePath}.${process.pid}.tmp`
  await fs.writeFile(tmp, text.endsWith('\n') ? text : `${text}\n`, 'utf-8')
  await fs.rename(tmp, filePath)
  const dnsChecks = await checkDomainsDns(parsed.lines)
  return { ...parsed, dnsChecks }
}
