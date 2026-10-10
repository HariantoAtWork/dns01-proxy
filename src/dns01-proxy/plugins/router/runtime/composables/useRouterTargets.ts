import type { RouterTarget, RouterTargetInput } from '#router-shared/types/routerTarget'

export function useRouterTargets() {
  const targets = ref<RouterTarget[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function loadTargets() {
    pending.value = true
    error.value = null
    try {
      const data = await $fetch<{ targets: RouterTarget[] }>('/api/router/targets')
      targets.value = data.targets
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load router targets'
      throw err
    }
    finally {
      pending.value = false
    }
  }

  async function saveTarget(input: RouterTargetInput) {
    if (input.id) {
      const data = await $fetch<{ target: RouterTarget }>(`/api/router/targets/${input.id}`, {
        method: 'PUT',
        body: input,
      })
      const index = targets.value.findIndex(target => target.id === data.target.id)
      if (index >= 0) {
        targets.value[index] = data.target
      }
      else {
        targets.value.push(data.target)
      }
      return data.target
    }
    const data = await $fetch<{ target: RouterTarget }>('/api/router/targets', {
      method: 'POST',
      body: input,
    })
    targets.value.push(data.target)
    return data.target
  }

  async function removeTarget(id: string) {
    await $fetch(`/api/router/targets/${id}`, { method: 'DELETE' })
    targets.value = targets.value.filter(target => target.id !== id)
  }

  return {
    targets,
    pending,
    error,
    loadTargets,
    saveTarget,
    removeTarget,
  }
}
