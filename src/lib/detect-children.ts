import { levenshtein } from './levenshtein'
import type { Child, DuplicatePair, DismissedDuplicate } from './types'
import { scoreTier } from './types'

/**
 * Child scoring — signals stack additively:
 *
 *   Same last name ................. +15
 *   Exact same first name .......... +20
 *   Similar first name ............. +10  (Levenshtein ≤ 2)
 *   Nickname matches first name .... +15
 *   Nickname similar to first name . +8   (Levenshtein ≤ 2)
 *   Same date of birth ............. +40
 *   Close DOB (within 7 days) ...... +20
 *   Same caregiver ................. +30
 *
 * Indexes: children are grouped by last name, first name, AND DOB.
 * A pair surfaced by any index gets compared on ALL signals.
 */

interface PairAccumulator {
  a: Child
  b: Child
  score: number
  reasons: string[]
}

/** Skip groups larger than this to avoid combinatorial explosion */
const MAX_GROUP = 50

export function detectChildDuplicates(
  children: Child[],
  dismissed: DismissedDuplicate[]
): DuplicatePair<Child>[] {
  const dismissedSet = new Set(
    dismissed.filter(d => d.entity_type === 'child').map(d => `${d.record_a_id}|${d.record_b_id}`)
  )
  const pairKey = (a: string, b: string) => { const s = [a, b].sort(); return `${s[0]}|${s[1]}` }
  const isDismissed = (idA: string, idB: string) => dismissedSet.has(pairKey(idA, idB))

  // --- Build three indexes ---
  const byLastName = new Map<string, Child[]>()
  const byFirstName = new Map<string, Child[]>()
  const byDOB = new Map<string, Child[]>()

  for (const child of children) {
    if (child.last_name) {
      const key = child.last_name.trim().toLowerCase()
      if (!byLastName.has(key)) byLastName.set(key, [])
      byLastName.get(key)!.push(child)
    }
    if (child.first_name) {
      const key = child.first_name.trim().toLowerCase()
      if (!byFirstName.has(key)) byFirstName.set(key, [])
      byFirstName.get(key)!.push(child)
    }
    if (child.date_of_birth) {
      const key = child.date_of_birth
      if (!byDOB.has(key)) byDOB.set(key, [])
      byDOB.get(key)!.push(child)
    }
  }

  const pairs = new Map<string, PairAccumulator>()
  const compared = new Set<string>()  // track pairs we've already fully compared

  const addSignal = (a: Child, b: Child, points: number, reason: string) => {
    if (a.id === b.id || isDismissed(a.id, b.id)) return
    const key = pairKey(a.id, b.id)
    if (!pairs.has(key)) {
      const sorted = [a.id, b.id].sort()
      pairs.set(key, {
        a: sorted[0] === a.id ? a : b,
        b: sorted[0] === a.id ? b : a,
        score: points,
        reasons: [reason],
      })
    } else {
      const existing = pairs.get(key)!
      existing.score += points
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason)
    }
  }

  const daysDiff = (dateA: string, dateB: string): number => {
    return Math.abs((new Date(dateA).getTime() - new Date(dateB).getTime()) / (1000 * 60 * 60 * 24))
  }

  /** Compare a pair on ALL signals, regardless of which index surfaced them */
  const comparePair = (a: Child, b: Child) => {
    const key = pairKey(a.id, b.id)
    if (compared.has(key)) return
    compared.add(key)

    // Last name
    if (a.last_name && b.last_name &&
        a.last_name.trim().toLowerCase() === b.last_name.trim().toLowerCase()) {
      addSignal(a, b, 15, 'Same last name')
    }

    // First name
    if (a.first_name && b.first_name) {
      const firstA = a.first_name.trim().toLowerCase()
      const firstB = b.first_name.trim().toLowerCase()
      if (firstA === firstB) {
        addSignal(a, b, 20, 'Same first name')
      } else {
        const dist = levenshtein(firstA, firstB)
        if (dist <= 2) {
          addSignal(a, b, 10, 'Similar first name')
        }
      }
    }

    // Nickname matching — check nickname against the other record's first name
    if (a.nickname && b.first_name) {
      const nickA = a.nickname.trim().toLowerCase()
      const firstB = b.first_name.trim().toLowerCase()
      if (nickA === firstB) addSignal(a, b, 15, 'Nickname matches first name')
      else if (levenshtein(nickA, firstB) <= 2) addSignal(a, b, 8, 'Nickname similar to first name')
    }
    if (b.nickname && a.first_name) {
      const nickB = b.nickname.trim().toLowerCase()
      const firstA = a.first_name.trim().toLowerCase()
      if (nickB === firstA) addSignal(a, b, 15, 'Nickname matches first name')
      else if (levenshtein(nickB, firstA) <= 2) addSignal(a, b, 8, 'Nickname similar to first name')
    }

    // DOB
    if (a.date_of_birth && b.date_of_birth) {
      if (a.date_of_birth === b.date_of_birth) {
        addSignal(a, b, 40, 'Same date of birth')
      } else if (daysDiff(a.date_of_birth, b.date_of_birth) <= 7) {
        addSignal(a, b, 20, 'Close date of birth')
      }
    }

    // Same caregiver
    if (a.caregiver_id && b.caregiver_id && a.caregiver_id === b.caregiver_id) {
      addSignal(a, b, 30, 'Same caregiver')
    }
  }

  /** Iterate all pairs in a group, capped at MAX_GROUP */
  const compareGroup = (group: Child[]) => {
    if (group.length < 2 || group.length > MAX_GROUP) return
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++)
        comparePair(group[i], group[j])
  }

  // --- Run through all three indexes ---
  for (const group of byLastName.values()) compareGroup(group)
  for (const group of byFirstName.values()) compareGroup(group)
  for (const group of byDOB.values()) compareGroup(group)

  // --- Detect sibling pairs ---
  // Same caregiver + same/close DOB + distinctly different first names = siblings, not duplicates
  for (const p of pairs.values()) {
    const hasCaregiver = p.reasons.includes('Same caregiver')
    const hasDOB = p.reasons.includes('Same date of birth') || p.reasons.includes('Close date of birth')
    const hasNameMatch = p.reasons.includes('Same first name') || p.reasons.includes('Similar first name')
      || p.reasons.includes('Nickname matches first name') || p.reasons.includes('Nickname similar to first name')

    if (hasDOB && !hasNameMatch) {
      const firstA = p.a.first_name?.trim().toLowerCase()
      const firstB = p.b.first_name?.trim().toLowerCase()
      // Both have first names but they're distinctly different — likely siblings (esp. twins)
      if (firstA && firstB && firstA !== firstB && levenshtein(firstA, firstB) > 2) {
        p.score = hasCaregiver ? 15 : 20  // demote well below threshold
        p.reasons.push('Likely sibling')
        ;(p as PairAccumulator & { tag: string }).tag = 'sibling'
      }
    }
  }

  // --- Filter and sort ---
  const MIN_SCORE = 30

  return Array.from(pairs.values())
    .filter(p => {
      const tag = (p as PairAccumulator & { tag?: string }).tag
      if (tag === 'sibling') return true  // always show sibling pairs
      return p.score >= MIN_SCORE
    })
    .map(p => {
      const capped = Math.min(p.score, 100)
      const tag = (p as PairAccumulator & { tag?: string }).tag as 'sibling' | undefined
      return {
        recordA: p.a,
        recordB: p.b,
        score: capped,
        tier: tag === 'sibling' ? 'low' as const : scoreTier(capped),
        reasons: p.reasons,
        ...(tag && { tag }),
      }
    })
    .sort((a, b) => b.score - a.score)
}
