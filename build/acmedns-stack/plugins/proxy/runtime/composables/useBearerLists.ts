import type {
  BearerGeneratedToken,
  BearerListInput,
  BearerListPublic,
} from '#proxy-shared/types/bearerKey'

export function useBearerLists() {
  const lists = ref<BearerListPublic[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function loadLists() {
    pending.value = true
    error.value = null
    try {
      const data = await $fetch<{ lists: BearerListPublic[] }>('/api/proxy/bearer-lists')
      lists.value = data.lists
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load bearer lists'
      throw err
    }
    finally {
      pending.value = false
    }
  }

  async function saveList(
    input: BearerListInput,
  ): Promise<{ list: BearerListPublic, generatedTokens: BearerGeneratedToken[] }> {
    if (input.id) {
      const data = await $fetch<{
        list: BearerListPublic
        generatedTokens?: BearerGeneratedToken[]
      }>(`/api/proxy/bearer-lists/${input.id}`, {
        method: 'PUT',
        body: input,
      })
      const index = lists.value.findIndex(list => list.id === data.list.id)
      if (index >= 0) {
        lists.value[index] = data.list
      }
      else {
        lists.value.push(data.list)
      }
      return { list: data.list, generatedTokens: data.generatedTokens || [] }
    }

    const data = await $fetch<{
      list: BearerListPublic
      generatedTokens?: BearerGeneratedToken[]
    }>('/api/proxy/bearer-lists', {
      method: 'POST',
      body: input,
    })
    lists.value.push(data.list)
    return { list: data.list, generatedTokens: data.generatedTokens || [] }
  }

  async function removeList(id: string) {
    await $fetch(`/api/proxy/bearer-lists/${id}`, { method: 'DELETE' })
    lists.value = lists.value.filter(list => list.id !== id)
  }

  return {
    lists,
    pending,
    error,
    loadLists,
    saveList,
    removeList,
  }
}
