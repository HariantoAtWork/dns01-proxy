export type AccountVerifyStatus = 'ok' | 'invalid' | 'unreachable'

export interface AccountVerifyResult {
  ok: boolean
  status: AccountVerifyStatus
  message: string
  code?: string
}

export function useAccountVerify() {
  const results = useState<Record<string, AccountVerifyResult>>('acmedns-account-verify', () => ({}))
  const pending = ref(false)
  const error = ref('')

  async function verifyAll(domains?: string[]) {
    pending.value = true
    error.value = ''
    try {
      const data = await $fetch<{ results: Record<string, AccountVerifyResult> }>(
        '/api/acmedns/verify',
        {
          method: 'POST',
          body: domains?.length ? { domains } : {},
        },
      )
      results.value = domains?.length
        ? { ...results.value, ...data.results }
        : data.results
    }
    catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Account verify failed'
    }
    finally {
      pending.value = false
    }
  }

  function statusFor(domain: string): AccountVerifyResult | undefined {
    return results.value[domain]
  }

  return {
    results,
    pending,
    error,
    verifyAll,
    statusFor,
  }
}
