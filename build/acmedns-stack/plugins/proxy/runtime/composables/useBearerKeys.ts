import type {
  BearerKeyCreated,
  BearerKeyInput,
  BearerKeyPublic,
} from '#proxy-shared/types/bearerKey'

export function useBearerKeys() {
  const keys = ref<BearerKeyPublic[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function loadKeys() {
    pending.value = true
    error.value = null
    try {
      const data = await $fetch<{ keys: BearerKeyPublic[] }>('/api/proxy/bearer-keys')
      keys.value = data.keys
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load bearer keys'
      throw err
    }
    finally {
      pending.value = false
    }
  }

  async function createKey(input: BearerKeyInput): Promise<BearerKeyCreated> {
    const data = await $fetch<{ key: BearerKeyPublic, token: string }>('/api/proxy/bearer-keys', {
      method: 'POST',
      body: input,
    })
    keys.value.push(data.key)
    return { ...data.key, token: data.token }
  }

  async function updateKey(input: BearerKeyInput & { id: string }): Promise<BearerKeyPublic> {
    const data = await $fetch<{ key: BearerKeyPublic }>(`/api/proxy/bearer-keys/${input.id}`, {
      method: 'PUT',
      body: input,
    })
    const index = keys.value.findIndex(key => key.id === data.key.id)
    if (index >= 0) {
      keys.value[index] = data.key
    }
    else {
      keys.value.push(data.key)
    }
    return data.key
  }

  async function rotateKey(id: string): Promise<BearerKeyCreated> {
    const data = await $fetch<{ key: BearerKeyCreated }>(`/api/proxy/bearer-keys/${id}/rotate`, {
      method: 'POST',
    })
    const index = keys.value.findIndex(key => key.id === data.key.id)
    if (index >= 0) {
      keys.value[index] = {
        id: data.key.id,
        name: data.key.name,
        prefix: data.key.prefix,
        createdAt: data.key.createdAt,
        updatedAt: data.key.updatedAt,
      }
    }
    return data.key
  }

  async function removeKey(id: string) {
    await $fetch(`/api/proxy/bearer-keys/${id}`, { method: 'DELETE' })
    keys.value = keys.value.filter(key => key.id !== id)
  }

  return {
    keys,
    pending,
    error,
    loadKeys,
    createKey,
    updateKey,
    rotateKey,
    removeKey,
  }
}
