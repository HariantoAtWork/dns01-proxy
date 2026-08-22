let locked = false
let queued = false

export async function withCertJobLock<T>(fn: () => Promise<T>): Promise<T> {
  if (locked) {
    queued = true
    throw createError({
      statusCode: 409,
      statusMessage: 'A certificate job is already running. Try again shortly.',
    })
  }
  locked = true
  try {
    return await fn()
  }
  finally {
    locked = false
  }
}

export function isCertJobLocked() {
  return locked
}

export function consumeCertJobQueued() {
  const was = queued
  queued = false
  return was
}
