import type { DnsRecordGroup } from '#shared/types/clientstorage'

export function normaliseDnsName(value: string) {
  return value.trim().replace(/\.$/, '').toLowerCase()
}

export function matchDnsRecord(
  records: DnsRecordGroup[] | undefined,
  name: string,
  matchData: string,
) {
  if (!Array.isArray(records)) {
    return false
  }

  const wantedName = normaliseDnsName(name)
  const wantedTarget = normaliseDnsName(matchData)
  const group = records.find(record => normaliseDnsName(record.name) === wantedName)

  if (!group?.data?.length) {
    return false
  }

  return group.data.some(entry => normaliseDnsName(String(entry)) === wantedTarget)
}
