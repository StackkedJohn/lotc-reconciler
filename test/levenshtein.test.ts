import { describe, it, expect } from 'vitest'
import { levenshtein } from '../src/lib/levenshtein'

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('john', 'john')).toBe(0)
  })
  it('handles single substitution', () => {
    expect(levenshtein('jon', 'john')).toBe(1)
  })
  it('handles transposition-like edits', () => {
    expect(levenshtein('micheal', 'michael')).toBe(2)
  })
  it('handles case sensitivity', () => {
    expect(levenshtein('Sara', 'sarah')).toBe(2)
  })
  it('returns length for empty vs non-empty', () => {
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('abc', '')).toBe(3)
  })
  it('returns 0 for both empty', () => {
    expect(levenshtein('', '')).toBe(0)
  })
})
