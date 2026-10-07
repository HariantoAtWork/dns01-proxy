import type { Ref } from 'vue'
import type { ForwardScheme, ProxyHostInput, ProxyLocation } from '#proxy-shared/types/proxyHost'
import {
  applyForwardTargetInput,
  defaultForwardPort,
  parseForwardTargetInput,
} from '#proxy-shared/utils/proxyHost'

type ForwardTarget = {
  forwardScheme: ForwardScheme
  forwardHost: string
  forwardPort: number
}

export function useForwardTargetFields(draft: Ref<ProxyHostInput>) {
  const portPlaceholder = computed(() => String(defaultForwardPort(draft.value.forwardScheme)))

  watch(
    () => draft.value.forwardScheme,
    (scheme, previous) => {
      if (!previous) {
        return
      }
      const port = Number(draft.value.forwardPort)
      if (!port || port === defaultForwardPort(previous as ForwardScheme)) {
        draft.value.forwardPort = defaultForwardPort(scheme)
      }
    },
  )

  watch(
    () => draft.value.locations.map(location => location.forwardScheme),
    (schemes, previous) => {
      if (!previous || schemes.length !== previous.length) {
        return
      }
      for (let index = 0; index < schemes.length; index++) {
        const scheme = schemes[index]
        const previousScheme = previous[index]
        if (!scheme || !previousScheme || scheme === previousScheme) {
          continue
        }
        const location = draft.value.locations[index]
        if (!location) {
          continue
        }
        const port = Number(location.forwardPort)
        if (!port || port === defaultForwardPort(previousScheme)) {
          location.forwardPort = defaultForwardPort(scheme)
        }
      }
    },
  )

  function pasteForwardTarget(target: ForwardTarget, event: ClipboardEvent) {
    const text = event.clipboardData?.getData('text') ?? ''
    if (!parseForwardTargetInput(text)) {
      return
    }
    event.preventDefault()
    applyForwardTargetInput(target, text)
  }

  function onHostForwardBlur() {
    applyForwardTargetInput(draft.value, draft.value.forwardHost)
  }

  function onLocationForwardBlur(location: ProxyLocation) {
    applyForwardTargetInput(location, location.forwardHost)
  }

  return {
    portPlaceholder,
    pasteForwardTarget,
    onHostForwardBlur,
    onLocationForwardBlur,
  }
}
