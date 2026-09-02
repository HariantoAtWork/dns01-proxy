export default defineEventHandler(async () => {
  const domains = await readLabDomainsFile()
  const inLab = domains.ok ? domains.lines.map(line => line.certName) : []
  const entries = await buildLabStatus(inLab)
  return { entries }
})
