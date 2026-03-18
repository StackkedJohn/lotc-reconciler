import { levenshtein } from './levenshtein'
import type { Child, DuplicatePair, DismissedDuplicate, Confidence } from './types'

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

  const pairs = new Map<string, { a: Child; b: Child; confidence: Confidence; reasons: string[] }>()
  const addPair = (a: Child, b: Child, confidence: Confidence, reason: string) => {
    if (a.id === b.id || isDismissed(a.id, b.id)) return
    const key = pairKey(a.id, b.id)
    if (!pairs.has(key)) {
      const sorted = [a.id, b.id].sort()
      pairs.set(key, { a: sorted[0] === a.id ? a : b, b: sorted[0] === a.id ? b : a, confidence, reasons: [reason] })
    } else {
      const existing = pairs.get(key)!
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason)
      if (confidence === 'high') existing.confidence = 'high'
    }
  }

  const daysDiff = (dateA: string, dateB: string): number => {
    return Math.abs((new Date(dateA).getTime() - new Date(dateB).getTime()) / (1000 * 60 * 60 * 24))
  }

  for (const group of byLastName.values()) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j]
        if (!a.first_name || !b.first_name) continue
        const firstA = a.first_name.toLowerCase(), firstB = b.first_name.toLowerCase()
        const exactFirstName = firstA === firstB

        // Rule 1: Same first name + last name + DOB
        if (exactFirstName && a.date_of_birth && b.date_of_birth && a.date_of_birth === b.date_of_birth)
          addPair(a, b, 'high', 'Same name and date of birth')

        // Rule 2: Same first name + last name + same caregiver
        if (exactFirstName && a.caregiver_id && b.caregiver_id && a.caregiver_id === b.caregiver_id)
          addPair(a, b, 'high', 'Same name and caregiver')

        // Rule 3: Fuzzy first name + close DOB
        if (!exactFirstName && a.date_of_birth && b.date_of_birth) {
          const dist = levenshtein(firstA, firstB)
          if (dist > 0 && dist <= 2 && daysDiff(a.date_of_birth, b.date_of_birth) <= 7)
            addPair(a, b, 'medium', 'Similar name, close date of birth')
        }
      }
    }
  }

  return Array.from(pairs.values())
    .map(p => ({ recordA: p.a, recordB: p.b, confidence: p.confidence, reasons: p.reasons }))
    .sort((a, b) => {
      if (a.confidence !== b.confidence) return a.confidence === 'high' ? -1 : 1
      return (a.recordA.last_name ?? '').localeCompare(b.recordA.last_name ?? '')
    })
}
