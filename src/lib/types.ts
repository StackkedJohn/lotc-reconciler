export interface NeonAccount {
  id: string
  neon_id: string
  account_type: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  company_name: string | null
  address_line1: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  individual_types: string[] | null
  source: string | null
  created_at: string
}

export interface Child {
  id: string
  first_name: string | null
  last_name: string | null
  nickname: string | null
  date_of_birth: string | null
  age: string | null
  gender: string | null
  ethnicity: string | null
  placement_type: string | null
  custody_county: string | null
  grade_fall: string | null
  caregiver_id: string | null
  social_worker_id: string | null
  source: string | null
  created_at: string
}

export type ConfidenceTier = 'near-certain' | 'high' | 'medium' | 'low'

export interface DuplicatePair<T> {
  recordA: T
  recordB: T
  score: number          // 0-100, higher = more likely duplicate
  tier: ConfidenceTier   // derived from score
  reasons: string[]
  tag?: 'spouse' | 'sibling'  // special classification that overrides tier
}

/** Derive tier from numeric score */
export function scoreTier(score: number): ConfidenceTier {
  if (score >= 80) return 'near-certain'
  if (score >= 50) return 'high'
  if (score >= 30) return 'medium'
  return 'low'
}

export interface DismissedDuplicate {
  id: string
  entity_type: string
  record_a_id: string
  record_b_id: string
  dismissed_by: string
  dismissed_at: string
}

export interface MergeResult {
  success: boolean
  survivor_id: string
  deleted_id: string
  fks_repointed: Array<{
    table: string
    column: string
    old_value: string
    new_value: string
    count: number
  }>
}
