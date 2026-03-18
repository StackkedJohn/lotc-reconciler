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
  it('detects exact email match as high confidence', () => {
    const a = makeAccount({ first_name: 'John', last_name: 'Smith', email: 'john@example.com' })
    const b = makeAccount({ first_name: 'Jonathan', last_name: 'Smith', email: 'JOHN@example.com' })
    const pairs = detectContactDuplicates([a, b], [])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].confidence).toBe('high')
    expect(pairs[0].reasons).toContain('Same email')
  })

  it('detects exact phone match as high confidence', () => {
    const a = makeAccount({ first_name: 'Jane', last_name: 'Doe', phone: '(800) 555-1234' })
    const b = makeAccount({ first_name: 'Jane', last_name: 'Doe', phone: '+18005551234' })
    const pairs = detectContactDuplicates([a, b], [])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].confidence).toBe('high')
  })

  it('detects fuzzy first name + exact last name as medium', () => {
    const a = makeAccount({ first_name: 'Jon', last_name: 'Smith' })
    const b = makeAccount({ first_name: 'John', last_name: 'Smith' })
    const pairs = detectContactDuplicates([a, b], [])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].confidence).toBe('medium')
    expect(pairs[0].reasons).toContain('Similar first name, same last name')
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

  it('deduplicates pairs found by multiple rules', () => {
    const a = makeAccount({ first_name: 'John', last_name: 'Smith', email: 'john@test.com', phone: '8005551234' })
    const b = makeAccount({ first_name: 'John', last_name: 'Smith', email: 'john@test.com', phone: '(800) 555-1234' })
    const pairs = detectContactDuplicates([a, b], [])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].confidence).toBe('high')
    expect(pairs[0].reasons.length).toBeGreaterThanOrEqual(2)
  })
})
