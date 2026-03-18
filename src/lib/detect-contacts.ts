import { normalizeToE164 } from './normalize-phone'
import { levenshtein } from './levenshtein'
import type { NeonAccount, DuplicatePair, DismissedDuplicate, Confidence } from './types'

export function detectContactDuplicates(
  accounts: NeonAccount[],
  dismissed: DismissedDuplicate[]
): DuplicatePair<NeonAccount>[] {
  const dismissedSet = new Set(
    dismissed.filter(d => d.entity_type === 'neon_account').map(d => `${d.record_a_id}|${d.record_b_id}`)
  )
  const pairKey = (a: string, b: string) => { const s = [a, b].sort(); return `${s[0]}|${s[1]}` }
  const isDismissed = (idA: string, idB: string) => dismissedSet.has(pairKey(idA, idB))

  const byEmail = new Map<string, NeonAccount[]>()
  const byPhone = new Map<string, NeonAccount[]>()
  const byLastName = new Map<string, NeonAccount[]>()

  for (const acc of accounts) {
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

  // Rule 1: Exact email
  for (const group of byEmail.values()) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++)
        addPair(group[i], group[j], 'high', 'Same email')
  }

  // Rule 2: Exact phone
  for (const group of byPhone.values()) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++)
        addPair(group[i], group[j], 'high', 'Same phone')
  }

  // Rule 3: Fuzzy first name + exact last name
  for (const group of byLastName.values()) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j]
        if (!a.first_name || !b.first_name) continue
        const dist = levenshtein(a.first_name.toLowerCase(), b.first_name.toLowerCase())
        if (dist > 0 && dist <= 2) addPair(a, b, 'medium', 'Similar first name, same last name')
      }
    }
  }

  // Rule 4: Same name + same zip
  for (const group of byLastName.values()) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j]
        if (!a.first_name || !b.first_name || !a.zip_code || !b.zip_code) continue
        if (a.first_name.toLowerCase() === b.first_name.toLowerCase() && a.zip_code === b.zip_code)
          addPair(a, b, 'medium', 'Same name and zip code')
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
