import { describe, expect, test } from 'bun:test'
import { EDGE_HTTPS_DRAIN_MS, stopHttpsWithDrainCap } from './edgeHttps'

describe('stopHttpsWithDrainCap', () => {
  test('returns graceful when stop finishes before drain cap', async () => {
    const server = {
      stop: async (_force?: boolean) => {
        await Bun.sleep(5)
      },
    }
    const how = await stopHttpsWithDrainCap(server as never, 200)
    expect(how).toBe('graceful')
  })

  test('force-stops when graceful drain exceeds cap', async () => {
    let forced = false
    const server = {
      stop: async (force?: boolean) => {
        if (force) {
          forced = true
          return
        }
        await Bun.sleep(500)
      },
    }
    const how = await stopHttpsWithDrainCap(server as never, 30)
    expect(how).toBe('forced')
    expect(forced).toBe(true)
  })

  test('default drain budget is 2s', () => {
    expect(EDGE_HTTPS_DRAIN_MS).toBe(2_000)
  })
})
