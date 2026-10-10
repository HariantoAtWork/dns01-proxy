<script setup lang="ts">
import type { RouterPortMap, RouterSource, RouterSourceInput } from '#router-shared/types/routerSource'
import type { RouterTarget } from '#router-shared/types/routerTarget'
import { emptyRouterSource, normalizeDomainNames } from '#router-shared/utils/routerSource'
import { sunshineMoonlightPortMaps } from '#router-shared/utils/sunshinePreset'

const {
  targets = [],
  saving = false,
} = defineProps<{
  targets?: RouterTarget[]
  saving?: boolean
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{
  save: [source: RouterSourceInput]
}>()

const draftId = ref<string | undefined>()
const domainsText = ref('')
const targetId = ref('')
const enabled = ref(true)
const portMaps = ref<RouterPortMap[]>([])
const formError = ref<string | null>(null)

const modalTitle = computed(() =>
  draftId.value ? 'Edit Source' : 'Add Source',
)

const enabledTargets = computed(() => targets.filter(target => target.enabled || target.id === targetId.value))

function load(source?: RouterSource | null) {
  formError.value = null
  if (source) {
    draftId.value = source.id
    domainsText.value = source.domainNames.join('\n')
    targetId.value = source.targetId
    enabled.value = source.enabled
    portMaps.value = source.portMaps.map(map => ({ ...map }))
  }
  else {
    const empty = emptyRouterSource()
    draftId.value = undefined
    domainsText.value = ''
    targetId.value = enabledTargets.value[0]?.id || ''
    enabled.value = empty.enabled !== false
    portMaps.value = []
  }
}

defineExpose({ load })

function applySunshinePreset() {
  portMaps.value = sunshineMoonlightPortMaps()
}

function addPortMap() {
  portMaps.value = [
    ...portMaps.value,
    { protocol: 'tcp', listenPort: 8080, targetPort: 8080 },
  ]
}

function removePortMap(index: number) {
  portMaps.value = portMaps.value.filter((_, i) => i !== index)
}

function onListenPortChange(index: number, value: string) {
  const map = portMaps.value[index]
  if (!map) {
    return
  }
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n)) {
    return
  }
  const next = [...portMaps.value]
  next[index] = {
    ...map,
    listenPort: n,
    targetPort: map.listenPort === map.targetPort ? n : map.targetPort,
  }
  portMaps.value = next
}

function onSave() {
  formError.value = null
  const domainNames = normalizeDomainNames(domainsText.value)
  if (!domainNames.length) {
    formError.value = 'At least one source domain is required'
    return
  }
  if (!targetId.value) {
    formError.value = 'Target is required'
    return
  }
  if (!portMaps.value.length) {
    formError.value = 'At least one port map is required'
    return
  }
  emit('save', {
    ...(draftId.value ? { id: draftId.value } : {}),
    domainNames,
    targetId: targetId.value,
    portMaps: portMaps.value.map(map => ({ ...map })),
    enabled: enabled.value,
  })
}
</script>

<template>
  <UiModal
    v-model:open="open"
    :title="modalTitle"
    size="lg"
  >
    <div class="flex flex-col gap-4">
      <p
        v-if="formError"
        class="text-sm text-danger"
        role="alert"
      >
        {{ formError }}
      </p>

      <p class="text-sm text-muted">
        Source domains are DNS labels pointing at this box. Routing is by listen port → target
        (one public port owner per protocol). Game ports should stay passthrough.
        This opens the target on the internet — no ACL in v1.
      </p>

      <UiField
        label="Source domains"
        hint="One per line — e.g. sunshine.harianto.link"
      >
        <textarea
          v-model="domainsText"
          rows="3"
          class="w-full rounded border border-rule bg-paper px-3 py-2 font-mono text-sm text-ink"
          placeholder="sunshine.harianto.link"
        />
      </UiField>

      <UiField label="Target">
        <select
          v-model="targetId"
          class="w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink"
        >
          <option
            disabled
            value=""
          >
            Select target…
          </option>
          <option
            v-for="target in enabledTargets"
            :key="target.id"
            :value="target.id"
          >
            {{ target.name }} ({{ target.host }})
          </option>
        </select>
      </UiField>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm font-medium text-ink">
          Port maps
        </p>
        <div class="flex flex-wrap gap-2">
          <UiButton
            variant="ghost"
            type="button"
            @click="applySunshinePreset"
          >
            Sunshine / Moonlight
          </UiButton>
          <UiButton
            variant="ghost"
            type="button"
            @click="addPortMap"
          >
            Add port
          </UiButton>
        </div>
      </div>

      <div
        v-if="!portMaps.length"
        class="rounded border border-dashed border-rule px-3 py-4 text-sm text-muted"
      >
        No port maps yet. Use the Sunshine / Moonlight preset or add ports manually.
      </div>

      <div
        v-else
        class="flex flex-col gap-2"
      >
        <div
          v-for="(map, index) in portMaps"
          :key="`${map.protocol}-${map.listenPort}-${index}`"
          class="grid grid-cols-[5rem_1fr_1fr_auto] items-end gap-2"
        >
          <UiField label="Proto">
            <select
              v-model="map.protocol"
              class="w-full rounded border border-rule bg-paper px-2 py-2 text-sm text-ink"
            >
              <option value="tcp">
                TCP
              </option>
              <option value="udp">
                UDP
              </option>
            </select>
          </UiField>
          <UiField label="Listen">
            <UiInput
              :model-value="String(map.listenPort)"
              inputmode="numeric"
              @update:model-value="onListenPortChange(index, $event)"
            />
          </UiField>
          <UiField label="Target port">
            <UiInput
              :model-value="String(map.targetPort)"
              inputmode="numeric"
              @update:model-value="map.targetPort = Number.parseInt($event, 10) || map.targetPort"
            />
          </UiField>
          <button
            type="button"
            class="mb-1 rounded px-2 py-2 text-sm text-muted hover:text-danger"
            @click="removePortMap(index)"
          >
            Remove
          </button>
        </div>
      </div>

      <label class="flex items-center gap-2 text-sm text-ink">
        <input
          v-model="enabled"
          type="checkbox"
          class="size-4 accent-[var(--signal)]"
        >
        Enabled
      </label>

      <div class="flex justify-end gap-2 border-t border-rule pt-3">
        <UiButton
          variant="ghost"
          :disabled="saving"
          @click="open = false"
        >
          Cancel
        </UiButton>
        <UiButton
          :disabled="saving"
          @click="onSave"
        >
          Save
        </UiButton>
      </div>
    </div>
  </UiModal>
</template>
