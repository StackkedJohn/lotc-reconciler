import { describe, it, expect } from 'vitest'
import { detectChildDuplicates } from '../src/lib/detect-children'
import type { Child, DismissedDuplicate } from '../src/lib/types'

const makeChild = (overrides: Partial<Child>): Child => ({
  id: crypto.randomUUID(),
  first_name: null, last_name: null, nickname: null,
  date_of_birth: null, age: null, gender: null, ethnicity: null,
  placement_type: null, custody_county: null, grade_fall: null,
  caregiver_id: null, social_worker_id: null, source: null,
  created_at: new Date().toISOString(),
  ...overrides,
})

describe('detectChildDuplicates', () => {
  it('detects same name + DOB as high confidence', () => {
    const a = makeChild({ first_name: 'Emma', last_name: 'Jones', date_of_birth: '2018-05-15' })
    const b = makeChild({ first_name: 'Emma', last_name: 'Jones', date_of_birth: '2018-05-15' })
    const pairs = detectChildDuplicates([a, b], [])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].confidence).toBe('high')
  })

  it('detects same name + same caregiver as high confidence', () => {
    const cid = crypto.randomUUID()
    const a = makeChild({ first_name: 'Emma', last_name: 'Jones', caregiver_id: cid, date_of_birth: '2018-05-15' })
    const b = makeChild({ first_name: 'Emma', last_name: 'Jones', caregiver_id: cid, date_of_birth: null })
    const pairs = detectChildDuplicates([a, b], [])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].confidence).toBe('high')
  })

  it('detects fuzzy first name + close DOB as medium', () => {
    const a = makeChild({ first_name: 'Sara', last_name: 'Brown', date_of_birth: '2019-03-10' })
    const b = makeChild({ first_name: 'Sarah', last_name: 'Brown', date_of_birth: '2019-03-12' })
    const pairs = detectChildDuplicates([a, b], [])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].confidence).toBe('medium')
  })

  it('does not flag different children', () => {
    const a = makeChild({ first_name: 'Emma', last_name: 'Jones', date_of_birth: '2018-05-15' })
    const b = makeChild({ first_name: 'Liam', last_name: 'Williams', date_of_birth: '2020-01-01' })
    expect(detectChildDuplicates([a, b], [])).toHaveLength(0)
  })

  it('excludes dismissed pairs', () => {
    const a = makeChild({ first_name: 'Emma', last_name: 'Jones', date_of_birth: '2018-05-15' })
    const b = makeChild({ first_name: 'Emma', last_name: 'Jones', date_of_birth: '2018-05-15' })
    const dismissed: DismissedDuplicate[] = [{
      id: '1', entity_type: 'child',
      record_a_id: [a.id, b.id].sort()[0], record_b_id: [a.id, b.id].sort()[1],
      dismissed_by: 'test', dismissed_at: new Date().toISOString(),
    }]
    expect(detectChildDuplicates([a, b], dismissed)).toHaveLength(0)
  })
})
