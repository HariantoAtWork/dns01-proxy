import { describe, expect, test } from 'bun:test'
import {
  tinyApexFulldomain,
  tinyApexLabel,
} from '../runtime/shared/utils/tinyModeDns'

describe('tinyApexLabel', () => {
  test('encodes apex with underscores and dashes', () => {
    expect(tinyApexLabel('mdstn.com')).toBe('_mdstn-com_')
    expect(tinyApexLabel('sylo.space')).toBe('_sylo-space_')
    expect(tinyApexLabel('MDSTN.COM.')).toBe('_mdstn-com_')
  })

  test('builds fulldomain under auth zone', () => {
    expect(tinyApexFulldomain('mdstn.com', 'auth.uti.email')).toBe('_mdstn-com_.auth.uti.email')
    expect(tinyApexFulldomain('sylo.space', 'auth.uti.email.')).toBe('_sylo-space_.auth.uti.email')
  })
})
