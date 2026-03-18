import { levenshtein } from './levenshtein'
import type { Child, DuplicatePair, DismissedDuplicate } from './types'
import { scoreTier } from './types'

/**
 * Child scoring — signals stack additively:
 *
 * PRIMARY (name-based — at least one required for a pair to appear):
 *   Exact same first name .......... +35
 *   Similar first name ............. +20  (Levenshtein ≤ 2)
 *   Nickname matches first name .... +30
 *   Nickname similar to first name . +15  (Levenshtein ≤ 2)
 *   Same last name ................. +20
 *
 * BOOSTERS (only meaningful when a name signal exists):
 *   Same date of birth ............. +25
 *   Same caregiver ................. +15
 *
 * Tiers:
 *   80+  "near-certain"  — full name + DOB/caregiver
 *   50-79 "high"         — same first+last, or name+DOB
 *   30-49 "medium"       — partial name match
 *   <30   dropped
 *
 * IMPORTANT: Pairs with NO name-related signal are always filtered out,
 * regardless of score. DOB and caregiver alone do not indicate a duplicate.
 */

interface PairAccumulator {
  a: Child
  b: Child
  score: number
  reasons: string[]
}

/** Skip groups larger than this to avoid combinatorial explosion */
const MAX_GROUP = 50

/** First-name signals (exact or fuzzy) */
const FIRST_NAME_REASONS = [
  'Same first name', 'Similar first name',
  'Nickname matches first name', 'Nickname similar to first name',
]

/** Check if a pair qualifies for display:
 *  - Same first name (exact), OR
 *  - Nickname matches first name (exact), OR
 *  - Same last name AND at least one first-name signal */
function pairQualifies(reasons: string[]): boolean {
  if (reasons.includes('Same first name')) return true
  if (reasons.includes('Nickname matches first name')) return true
  if (reasons.includes('Same last name') && reasons.some(r => FIRST_NAME_REASONS.includes(r))) return true
  return false
}

export function detectChildDuplicates(
  children: Child[],
  dismissed: DismissedDuplicate[]
): DuplicatePair<Child>[] {
  const dismissedSet = new Set(
    dismissed.filter(d => d.entity_type === 'child').map(d => `${d.record_a_id}|${d.record_b_id}`)
  )
  const pairKey = (a: string, b: string) => { const s = [a, b].sort(); return `${s[0]}|${s[1]}` }
  const isDismissed = (idA: string, idB: string) => dismissedSet.has(pairKey(idA, idB))

  // --- Build two indexes ---
  // Last name: catches same-name duplicates
  // DOB: catches same child after placement/name change (same first name + same DOB)
  // (No first-name index — common names like "Ava" create too many false pairs)
  const byLastName = new Map<string, Child[]>()
  const byDOB = new Map<string, Child[]>()

  for (const child of children) {
    if (child.last_name) {
      const key = child.last_name.trim().toLowerCase()
      if (!byLastName.has(key)) byLastName.set(key, [])
      byLastName.get(key)!.push(child)
    }
    if (child.date_of_birth) {
      const key = child.date_of_birth
      if (!byDOB.has(key)) byDOB.set(key, [])
      byDOB.get(key)!.push(child)
    }
  }

  const pairs = new Map<string, PairAccumulator>()
  const compared = new Set<string>()

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

  /** Compare a pair on ALL signals, regardless of which index surfaced them */
  const comparePair = (a: Child, b: Child) => {
    const key = pairKey(a.id, b.id)
    if (compared.has(key)) return
    compared.add(key)

    // --- Primary: name signals ---

    // Last name (+20)
    if (a.last_name && b.last_name &&
        a.last_name.trim().toLowerCase() === b.last_name.trim().toLowerCase()) {
      addSignal(a, b, 20, 'Same last name')
    }

    // First name (+35 exact, +20 similar)
    if (a.first_name && b.first_name) {
      const firstA = a.first_name.trim().toLowerCase()
      const firstB = b.first_name.trim().toLowerCase()
      if (firstA === firstB) {
        addSignal(a, b, 35, 'Same first name')
      } else {
        const dist = levenshtein(firstA, firstB)
        if (dist <= 2) {
          addSignal(a, b, 20, 'Similar first name')
        }
      }
    }

    // Nickname matching (+30 exact, +15 similar)
    if (a.nickname && b.first_name) {
      const nickA = a.nickname.trim().toLowerCase()
      const firstB = b.first_name.trim().toLowerCase()
      if (nickA === firstB) addSignal(a, b, 30, 'Nickname matches first name')
      else if (levenshtein(nickA, firstB) <= 2) addSignal(a, b, 15, 'Nickname similar to first name')
    }
    if (b.nickname && a.first_name) {
      const nickB = b.nickname.trim().toLowerCase()
      const firstA = a.first_name.trim().toLowerCase()
      if (nickB === firstA) addSignal(a, b, 30, 'Nickname matches first name')
      else if (levenshtein(nickB, firstA) <= 2) addSignal(a, b, 15, 'Nickname similar to first name')
    }

    // --- Boosters: only meaningful alongside name signals ---

    // Same DOB (+25)
    if (a.date_of_birth && b.date_of_birth && a.date_of_birth === b.date_of_birth) {
      addSignal(a, b, 25, 'Same date of birth')
    }

    // Same caregiver (+15)
    if (a.caregiver_id && b.caregiver_id && a.caregiver_id === b.caregiver_id) {
      addSignal(a, b, 15, 'Same caregiver')
    }
  }

  /** Iterate all pairs in a group, capped at MAX_GROUP */
  const compareGroup = (group: Child[]) => {
    if (group.length < 2 || group.length > MAX_GROUP) return
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++)
        comparePair(group[i], group[j])
  }

  // --- Run through both indexes ---
  for (const group of byLastName.values()) compareGroup(group)
  for (const group of byDOB.values()) compareGroup(group)

  // --- Detect sibling pairs ---
  // Same household (caregiver OR last name) + same DOB + name match but distinctly different = siblings
  for (const p of pairs.values()) {
    const hasCaregiver = p.reasons.includes('Same caregiver')
    const hasLastName = p.reasons.includes('Same last name')
    const hasDOB = p.reasons.includes('Same date of birth')
    const hasNameMatch = p.reasons.some(r => FIRST_NAME_REASONS.includes(r))

    if (hasDOB && (hasCaregiver || hasLastName)) {
      const firstA = p.a.first_name?.trim().toLowerCase()
      const firstB = p.b.first_name?.trim().toLowerCase()
      if (firstA && firstB && firstA !== firstB && levenshtein(firstA, firstB) > 2) {
        // No name match at all — clear sibling
        p.score = 15
        if (!p.reasons.includes('Likely sibling')) p.reasons.push('Likely sibling')
        ;(p as PairAccumulator & { tag: string }).tag = 'sibling'
      } else if (hasNameMatch && firstA && firstB && firstA !== firstB && hasCaregiver && hasLastName) {
        // Has a fuzzy name match (e.g. Madison/Mason) but ALSO same household + same DOB
        // Still likely siblings (twins with similar names), but keep as low-confidence
        p.score = 25
        if (!p.reasons.includes('Likely sibling')) p.reasons.push('Likely sibling')
        ;(p as PairAccumulator & { tag: string }).tag = 'sibling'
      }
    }
  }

  // --- Filter and sort ---
  const MIN_SCORE = 30

  return Array.from(pairs.values())
    .filter(p => {
      const tag = (p as PairAccumulator & { tag?: string }).tag
      if (tag === 'sibling') return true

      // Must qualify via name signals — DOB/caregiver alone is not a duplicate
      if (!pairQualifies(p.reasons)) return false

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
