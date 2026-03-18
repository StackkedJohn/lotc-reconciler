import { normalizeToE164 } from './normalize-phone'
import { levenshtein } from './levenshtein'
import type { NeonAccount, DuplicatePair, DismissedDuplicate } from './types'
import { scoreTier } from './types'

/** Skip phone groups larger than this — org numbers or placeholders */
const MAX_PHONE_GROUP = 10

/** Skip last-name groups larger than this — too many common surnames */
const MAX_LASTNAME_GROUP = 50

/** Records must have at least a first OR last name */
function hasName(acc: NeonAccount): boolean {
  return !!(acc.first_name?.trim() || acc.last_name?.trim())
}

/**
 * Scoring system — signals stack additively:
 *
 *   Same email .............. +45
 *   Same phone .............. +45
 *   Exact same last name .... +15
 *   Exact same first name ... +20
 *   Similar first name ...... +10  (Levenshtein ≤ 2)
 *   Same zip code ........... +5
 *
 * Tiers:
 *   90-100  "near-certain"  — same name + same email/phone (slam dunk)
 *   50-89   "high"          — strong signal (email OR phone + partial name match)
 *   30-49   "medium"        — moderate (fuzzy name only, or phone-only different names)
 *   <30     dropped         — too weak to show
 */

interface PairAccumulator {
  a: NeonAccount
  b: NeonAccount
  score: number
  reasons: string[]
}

export function detectContactDuplicates(
  accounts: NeonAccount[],
  dismissed: DismissedDuplicate[]
): DuplicatePair<NeonAccount>[] {
  const named = accounts.filter(hasName)

  const dismissedSet = new Set(
    dismissed.filter(d => d.entity_type === 'neon_account').map(d => `${d.record_a_id}|${d.record_b_id}`)
  )
  const pairKey = (a: string, b: string) => { const s = [a, b].sort(); return `${s[0]}|${s[1]}` }
  const isDismissed = (idA: string, idB: string) => dismissedSet.has(pairKey(idA, idB))

  // Build indexes
  const byEmail = new Map<string, NeonAccount[]>()
  const byPhone = new Map<string, NeonAccount[]>()
  const byLastName = new Map<string, NeonAccount[]>()

  for (const acc of named) {
    if (acc.email) {
      const key = acc.email.trim().toLowerCase()
      if (!byEmail.has(key)) byEmail.set(key, [])
      byEmail.get(key)!.push(acc)
    }
    if (acc.phone) {
      const key = normalizeToE164(acc.phone)
      if (key) { if (!byPhone.has(key)) byPhone.set(key, []); byPhone.get(key)!.push(acc) }
    }
    if (acc.last_name) {
      const key = acc.last_name.trim().toLowerCase()
      if (!byLastName.has(key)) byLastName.set(key, [])
      byLastName.get(key)!.push(acc)
    }
  }

  // Accumulate pairs with additive scoring
  const pairs = new Map<string, PairAccumulator>()

  const addSignal = (a: NeonAccount, b: NeonAccount, points: number, reason: string) => {
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

  // --- Collect all signals ---

  // Email matches (+45)
  for (const group of byEmail.values()) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++)
        addSignal(group[i], group[j], 45, 'Same email')
  }

  // Phone matches (+45, skip large groups)
  for (const [, group] of byPhone) {
    if (group.length < 2 || group.length > MAX_PHONE_GROUP) continue
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++)
        addSignal(group[i], group[j], 45, 'Same phone')
  }

  // Name signals — only within same last name groups
  for (const group of byLastName.values()) {
    if (group.length < 2 || group.length > MAX_LASTNAME_GROUP) continue
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j]

        // Same last name (+15) — already guaranteed by the group
        addSignal(a, b, 15, 'Same last name')

        if (a.first_name && b.first_name) {
          const firstA = a.first_name.toLowerCase()
          const firstB = b.first_name.toLowerCase()

          if (firstA === firstB) {
            // Exact first name (+20)
            addSignal(a, b, 20, 'Same first name')
          } else {
            const dist = levenshtein(firstA, firstB)
            if (dist <= 2) {
              // Similar first name (+10)
              addSignal(a, b, 10, 'Similar first name')
            }
          }
        }

        // Same zip (+5)
        if (a.zip_code && b.zip_code && a.zip_code === b.zip_code) {
          addSignal(a, b, 5, 'Same zip code')
        }
      }
    }
  }

  // --- Detect spouse pairs ---
  // Shared email/phone + same last name + distinctly different first names = likely spouse
  for (const p of pairs.values()) {
    const hasContactSignal = p.reasons.some(r => r === 'Same email' || r === 'Same phone')
    const hasLastName = p.reasons.includes('Same last name')
    const hasNameMatch = p.reasons.includes('Same first name') || p.reasons.includes('Similar first name')

    if (hasContactSignal && hasLastName && !hasNameMatch) {
      // Both have first names but they're distinctly different — spouse pattern
      const firstA = p.a.first_name?.trim().toLowerCase()
      const firstB = p.b.first_name?.trim().toLowerCase()
      if (firstA && firstB && firstA !== firstB) {
        p.score = 20  // demote below display threshold by default
        p.reasons.push('Likely spouse/household')
        ;(p as PairAccumulator & { tag: string }).tag = 'spouse'
      }
    }
  }

  // --- Filter and sort ---

  // Drop pairs below threshold (score < 30) and name-only pairs that lack any contact signal
  // Exception: spouse-tagged pairs are kept at score 20 so users can still see them
  const MIN_SCORE = 30

  return Array.from(pairs.values())
    .filter(p => {
      const tag = (p as PairAccumulator & { tag?: string }).tag
      if (tag === 'spouse') return true  // always show spouse pairs
      if (p.score < MIN_SCORE) return false
      const hasContactSignal = p.reasons.some(r => r === 'Same email' || r === 'Same phone')
      if (!hasContactSignal && p.score < 35) return false
      return true
    })
    .map(p => {
      const capped = Math.min(p.score, 100)
      const tag = (p as PairAccumulator & { tag?: string }).tag as 'spouse' | undefined
      return {
        recordA: p.a,
        recordB: p.b,
        score: capped,
        tier: tag === 'spouse' ? 'low' as const : scoreTier(capped),
        reasons: p.reasons,
        ...(tag && { tag }),
      }
    })
    .sort((a, b) => b.score - a.score) // highest score first
}
