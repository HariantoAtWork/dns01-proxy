export function throwIfAborted(signal?: AbortSignal, message = 'DNS-01 aborted') {
  if (!signal?.aborted) {
    return
  }
  const reason = signal.reason
  if (reason instanceof Error) {
    throw reason
  }
  const err = new Error(typeof reason === 'string' ? reason : message)
  err.name = 'AbortError'
  throw err
}

export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve()
  }
  throwIfAborted(signal)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      try {
        throwIfAborted(signal)
      }
      catch (error) {
        reject(error)
      }
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function createChallengeSerialGate() {
  let gate = Promise.resolve()

  type Turn = {
    markCreateFinished: () => void
    markRemove: () => void
    abort: () => void
  }

  return {
    async enter(): Promise<Turn> {
      const previous = gate
      let releaseGate!: () => void
      gate = previous.then(() => new Promise<void>((resolve) => {
        releaseGate = resolve
      }))
      await previous

      let createFinished = false
      let removeSignalled = false
      let released = false

      const release = () => {
        if (released) {
          return
        }
        released = true
        releaseGate()
      }

      return {
        markCreateFinished() {
          createFinished = true
          if (removeSignalled) {
            release()
          }
        },
        markRemove() {
          removeSignalled = true
          if (createFinished) {
            release()
          }
        },
        abort() {
          release()
        },
      }
    },
  }
}
