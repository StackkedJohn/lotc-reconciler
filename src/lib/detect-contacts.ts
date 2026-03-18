import { normalizeToE164 } from './normalize-phone'
import { levenshtein } from './levenshtein'
import type { NeonAccount, DuplicatePair, DismissedDuplicate, Confidence } from './types'

/** Skip phone groups larger than this — they're org numbers or placeholders, not real duplicates */
const MAX_PHONE_GROUP = 10

/** Records must have at least a first OR last name to be considered for matching */
function hasName(acc: NeonAccount): boolean {
  return !!(acc.first_name?.trim() || acc.last_name?.trim())
}

/** For email matches: require the pair to look like the same person, not just shared email */
function emailPairLooksLikeDuplicate(a: NeonAccount, b: NeonAccount): boolean {
  const lastA = a.last_name?.trim().toLowerCase()
  const lastB = b.last_name?.trim().toLowerCase()
  const firstA = a.first_name?.trim().toLowerCase()
  const firstB = b.first_name?.trim().toLowerCase()

  // Same last name → likely duplicate
  if (lastA && lastB && lastA === lastB) return true

  // Same first name → likely duplicate (e.g. two "Doug" records)
  if (firstA && firstB && firstA === firstB) return true

  // Fuzzy first name match with same last name
  if (firstA && firstB && lastA && lastB && lastA === lastB) {
    if (levenshtein(firstA, firstB) <= 2) return true
  }

  // One or both have no name — can't tell, so include it (user decides)
  if (!hasName(a) || !hasName(b)) return true

  // Different names entirely → probably a shared email (family/org), not a duplicate
  return false
}

export function detectContactDuplicates(
  accounts: NeonAccount[],
  dismissed: DismissedDuplicate[]
): DuplicatePair<NeonAccount>[] {
  // Filter out records with no name at all — they're not useful to merge
  const named = accounts.filter(hasName)

  const dismissedSet = new Set(
    dismissed.filter(d => d.entity_type === 'neon_account').map(d => `${d.record_a_id}|${d.record_b_id}`)
  )
  const pairKey = (a: string, b: string) => { const s = [a, b].sort(); return `${s[0]}|${s[1]}` }
  const isDismissed = (idA: string, idB: string) => dismissedSet.has(pairKey(idA, idB))

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

  const pairs = new Map<string, { a: NeonAccount; b: NeonAccount; confidence: Confidence; reasons: string[] }>()
  const addPair = (a: NeonAccount, b: NeonAccount, confidence: Confidence, reason: string) => {
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

  // Rule 1: Exact email — but only if the pair looks like the same person
  for (const group of byEmail.values()) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++)
        if (emailPairLooksLikeDuplicate(group[i], group[j]))
          addPair(group[i], group[j], 'high', 'Same email')
  }

  // Rule 2: Exact phone — skip large groups (org numbers, placeholders)
  for (const [, group] of byPhone) {
    if (group.length < 2 || group.length > MAX_PHONE_GROUP) continue
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++)
        addPair(group[i], group[j], 'high', 'Same phone')
  }

  // Rule 3: Fuzzy first name + exact last name (skip large groups — common surnames)
  for (const group of byLastName.values()) {
    if (group.length < 2 || group.length > 50) continue
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j]
        if (!a.first_name || !b.first_name) continue
        const dist = levenshtein(a.first_name.toLowerCase(), b.first_name.toLowerCase())
        if (dist > 0 && dist <= 2) addPair(a, b, 'medium', 'Similar first name, same last name')
      }
    }
  }

  // Rule 4: Exact same full name — only flag if they also share a zip or phone area code
  // This catches "Katie Myers" appearing 216 times as a real person with multiple records
  // but NOT "John Smith" in the same zip who are unrelated people
  for (const group of byLastName.values()) {
    if (group.length < 2 || group.length > 50) continue
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j]
        if (!a.first_name || !b.first_name) continue
        if (a.first_name.toLowerCase() !== b.first_name.toLowerCase()) continue
        // Exact name match — require an additional signal: same zip AND same phone area code or same email domain
        const sameZip = a.zip_code && b.zip_code && a.zip_code === b.zip_code
        const sameEmailDomain = a.email && b.email &&
          a.email.split('@')[1]?.toLowerCase() === b.email.split('@')[1]?.toLowerCase()
        if (sameZip && sameEmailDomain)
          addPair(a, b, 'medium', 'Same name, zip, and email domain')
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
