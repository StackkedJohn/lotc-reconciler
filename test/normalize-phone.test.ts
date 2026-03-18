import { describe, it, expect } from 'vitest'
import { normalizeToE164 } from '../src/lib/normalize-phone'

describe('normalizeToE164', () => {
  it('passes through valid E.164', () => {
    expect(normalizeToE164('+18005551234')).toBe('+18005551234')
  })
  it('adds +1 to 10-digit US number', () => {
    expect(normalizeToE164('8005551234')).toBe('+18005551234')
  })
  it('adds + to 11-digit starting with 1', () => {
    expect(normalizeToE164('18005551234')).toBe('+18005551234')
  })
  it('strips formatting characters', () => {
    expect(normalizeToE164('(800) 555-1234')).toBe('+18005551234')
  })
  it('handles +1 with formatting', () => {
    expect(normalizeToE164('+1 (800) 555-1234')).toBe('+18005551234')
  })
  it('returns original for short numbers', () => {
    expect(normalizeToE164('555')).toBe('+555')
  })
  it('returns empty for empty', () => {
    expect(normalizeToE164('')).toBe('')
  })
})
