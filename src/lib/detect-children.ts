import { levenshtein } from './levenshtein'
import type { Child, DuplicatePair, DismissedDuplicate } from './types'
import { scoreTier } from './types'

/**
 * Child scoring:
 *   Same last name ........... +15
 *   Exact same first name .... +20
 *   Similar first name ....... +10
 *   Same date of birth ....... +40
 *   Close DOB (within 7 days)  +20
 *   Same caregiver ........... +30
 */

interface PairAccumulator {
  a: Child
  b: Child
  score: number
  reasons: string[]
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

  const byLastName = new Map<string, Child[]>()
  for (const child of children) {
    if (child.last_name) {
      const key = child.last_name.trim().toLowerCase()
      if (!byLastName.has(key)) byLastName.set(key, [])
      byLastName.get(key)!.push(child)
    }
  }

  const pairs = new Map<string, PairAccumulator>()

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

  for (const group of byLastName.values()) {
    if (group.length < 2 || group.length > 50) continue
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j]
        if (!a.first_name || !b.first_name) continue

        const firstA = a.first_name.toLowerCase()
        const firstB = b.first_name.toLowerCase()

        // Same last name (+15)
        addSignal(a, b, 15, 'Same last name')

        // Name matching
        if (firstA === firstB) {
          addSignal(a, b, 20, 'Same first name')
        } else {
          const dist = levenshtein(firstA, firstB)
          if (dist <= 2) {
            addSignal(a, b, 10, 'Similar first name')
          }
        }

        // DOB matching
        if (a.date_of_birth && b.date_of_birth) {
          if (a.date_of_birth === b.date_of_birth) {
            addSignal(a, b, 40, 'Same date of birth')
          } else if (daysDiff(a.date_of_birth, b.date_of_birth) <= 7) {
            addSignal(a, b, 20, 'Close date of birth')
          }
        }

        // Same caregiver (+30)
        if (a.caregiver_id && b.caregiver_id && a.caregiver_id === b.caregiver_id) {
          addSignal(a, b, 30, 'Same caregiver')
        }
      }
    }
  }

  const MIN_SCORE = 30

  return Array.from(pairs.values())
    .filter(p => p.score >= MIN_SCORE)
    .map(p => ({
      recordA: p.a,
      recordB: p.b,
      score: Math.min(p.score, 100),
      tier: scoreTier(Math.min(p.score, 100)),
      reasons: p.reasons,
    }))
    .sort((a, b) => b.score - a.score)
}
