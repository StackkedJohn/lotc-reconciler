import { describe, it, expect } from 'vitest'
import { detectContactDuplicates } from '../src/lib/detect-contacts'
import type { NeonAccount, DismissedDuplicate } from '../src/lib/types'

const makeAccount = (overrides: Partial<NeonAccount>): NeonAccount => ({
  id: crypto.randomUUID(),
  neon_id: `SUB-${Math.random().toString(36).slice(2, 10)}`,
  account_type: 'INDIVIDUAL',
  first_name: null, last_name: null, email: null, phone: null,
  company_name: null, address_line1: null, city: null, state: null,
  zip_code: null, individual_types: null, source: null,
  created_at: new Date().toISOString(),
  ...overrides,
})

describe('detectContactDuplicates', () => {
  it('same name + same email = near-certain', () => {
    const a = makeAccount({ first_name: 'John', last_name: 'Smith', email: 'john@example.com' })
    const b = makeAccount({ first_name: 'John', last_name: 'Smith', email: 'JOHN@example.com' })
    const pairs = detectContactDuplicates([a, b], [])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].tier).toBe('near-certain')
    expect(pairs[0].score).toBeGreaterThanOrEqual(80)
    expect(pairs[0].reasons).toContain('Same email')
  })

  it('same name + same phone = near-certain', () => {
    const a = makeAccount({ first_name: 'Jane', last_name: 'Doe', phone: '(800) 555-1234' })
    const b = makeAccount({ first_name: 'Jane', last_name: 'Doe', phone: '+18005551234' })
    const pairs = detectContactDuplicates([a, b], [])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].tier).toBe('near-certain')
  })

  it('same email different names = high (not near-certain)', () => {
    const a = makeAccount({ first_name: 'John', last_name: 'Smith', email: 'john@example.com' })
    const b = makeAccount({ first_name: 'Jonathan', last_name: 'Smith', email: 'john@example.com' })
    const pairs = detectContactDuplicates([a, b], [])
    expect(pairs).toHaveLength(1)
    // email(40) + same last(15) + similar first(10) = 65 → high
    expect(pairs[0].tier).toBe('high')
  })

  it('fuzzy name only (no email/phone) is filtered out as too weak', () => {
    const a = makeAccount({ first_name: 'Jon', last_name: 'Parker' })
    const b = makeAccount({ first_name: 'John', last_name: 'Parker' })
    const pairs = detectContactDuplicates([a, b], [])
    // same last(15) + similar first(10) = 25, below threshold with no contact signal
    expect(pairs).toHaveLength(0)
  })

  it('fuzzy name + same email = high', () => {
    const a = makeAccount({ first_name: 'Jon', last_name: 'Parker', email: 'jparker@test.com' })
    const b = makeAccount({ first_name: 'John', last_name: 'Parker', email: 'jparker@test.com' })
    const pairs = detectContactDuplicates([a, b], [])
    // email(40) + same last(15) + similar first(10) = 65 → high
    expect(pairs).toHaveLength(1)
    expect(pairs[0].tier).toBe('high')
  })

  it('excludes dismissed pairs', () => {
    const a = makeAccount({ first_name: 'John', last_name: 'Smith', email: 'john@example.com' })
    const b = makeAccount({ first_name: 'John', last_name: 'Smith', email: 'john@example.com' })
    const dismissed: DismissedDuplicate[] = [{
      id: '1', entity_type: 'neon_account',
      record_a_id: [a.id, b.id].sort()[0], record_b_id: [a.id, b.id].sort()[1],
      dismissed_by: 'test', dismissed_at: new Date().toISOString(),
    }]
    expect(detectContactDuplicates([a, b], dismissed)).toHaveLength(0)
  })

  it('does not flag completely different records', () => {
    const a = makeAccount({ first_name: 'Alice', last_name: 'Johnson', email: 'alice@example.com' })
    const b = makeAccount({ first_name: 'Bob', last_name: 'Williams', email: 'bob@example.com' })
    expect(detectContactDuplicates([a, b], [])).toHaveLength(0)
  })

  it('stacks signals: same name + email + phone = max score', () => {
    const a = makeAccount({ first_name: 'John', last_name: 'Smith', email: 'john@test.com', phone: '8005551234' })
    const b = makeAccount({ first_name: 'John', last_name: 'Smith', email: 'john@test.com', phone: '(800) 555-1234' })
    const pairs = detectContactDuplicates([a, b], [])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].tier).toBe('near-certain')
    expect(pairs[0].score).toBe(100) // capped at 100
    expect(pairs[0].reasons.length).toBeGreaterThanOrEqual(3)
  })

  it('sorts by score descending', () => {
    const a = makeAccount({ first_name: 'John', last_name: 'Smith', email: 'john@test.com', phone: '8005551234' })
    const b = makeAccount({ first_name: 'John', last_name: 'Smith', email: 'john@test.com', phone: '(800) 555-1234' })
    const c = makeAccount({ first_name: 'Jane', last_name: 'Doe', email: 'jane@test.com' })
    const d = makeAccount({ first_name: 'Jane', last_name: 'Doe', email: 'jane@test.com' })
    const pairs = detectContactDuplicates([a, b, c, d], [])
    expect(pairs.length).toBeGreaterThanOrEqual(2)
    expect(pairs[0].score).toBeGreaterThanOrEqual(pairs[1].score)
  })

  it('filters out unnamed records', () => {
    const a = makeAccount({ first_name: null, last_name: null, email: 'test@example.com' })
    const b = makeAccount({ first_name: null, last_name: null, email: 'test@example.com' })
    expect(detectContactDuplicates([a, b], [])).toHaveLength(0)
  })
})
