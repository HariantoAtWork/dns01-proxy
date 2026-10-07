import { describe, expect, test } from 'bun:test'
import {
  acmeRequestStatusClass,
  certJobTaskStatusClass,
} from '../runtime/shared/utils/jobProgress'

describe('jobProgress status classes', () => {
  test('uses green for done cert tasks and ACME steps', () => {
    expect(certJobTaskStatusClass('done')).toBe('text-live')
    expect(acmeRequestStatusClass('done')).toBe('text-live')
  })

  test('uses bold green for running states', () => {
    expect(certJobTaskStatusClass('running')).toBe('text-live font-semibold')
    expect(acmeRequestStatusClass('running')).toBe('text-live font-semibold')
  })

  test('uses red for failed states', () => {
    expect(certJobTaskStatusClass('failed')).toBe('text-danger')
    expect(acmeRequestStatusClass('failed')).toBe('text-danger')
  })
})
