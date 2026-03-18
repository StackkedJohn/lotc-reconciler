import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { fetchAll } from '../lib/fetch-all'
import { detectContactDuplicates } from '../lib/detect-contacts'
import { detectChildDuplicates } from '../lib/detect-children'
import { StatsBar } from './StatsBar'
import { DuplicateCard } from './DuplicateCard'
import type { NeonAccount, Child, DuplicatePair, DismissedDuplicate, ConfidenceTier } from '../lib/types'

type Tab = 'contacts' | 'children'
type Filter = 'all' | ConfidenceTier

interface Props {
  userName: string
  onStartReview: (
    pairs: DuplicatePair<NeonAccount | Child>[],
    startIndex: number,
    entityType: 'neon_account' | 'child'
  ) => void
}

export function Dashboard({ userName: _userName, onStartReview }: Props) {
  const [tab, setTab] = useState<Tab>('contacts')
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(false)
  const [contactPairs, setContactPairs] = useState<DuplicatePair<NeonAccount>[]>([])
  const [childPairs, setChildPairs] = useState<DuplicatePair<Child>[]>([])
  const [showDismissed, setShowDismissed] = useState(false)

  const scan = useCallback(async () => {
    setLoading(true)
    try {
      const { data: dismissed } = await supabase.from('dismissed_duplicates').select('*')
      const dismissedList = (dismissed ?? []) as unknown as DismissedDuplicate[]

      const accounts = await fetchAll<NeonAccount>(
        'neon_accounts',
        'id, neon_id, account_type, first_name, last_name, email, phone, company_name, address_line1, city, state, zip_code, individual_types, source, created_at'
      )
      setContactPairs(detectContactDuplicates(accounts, showDismissed ? [] : dismissedList))

      const children = await fetchAll<Child>(
        'children',
        'id, first_name, last_name, nickname, date_of_birth, age, gender, ethnicity, placement_type, custody_county, grade_fall, caregiver_id, social_worker_id, source, created_at'
      )
      setChildPairs(detectChildDuplicates(children, showDismissed ? [] : dismissedList))
    } finally {
      setLoading(false)
    }
  }, [showDismissed])

  useEffect(() => { scan() }, [scan])

  const pairs = tab === 'contacts' ? contactPairs : childPairs
  const filtered = filter === 'all' ? pairs : pairs.filter(p => p.tier === filter)
  const nearCertainCount = pairs.filter(p => p.tier === 'near-certain').length
  const highCount = pairs.filter(p => p.tier === 'high').length
  const mediumCount = pairs.filter(p => p.tier === 'medium').length
  const entityType = tab === 'contacts' ? 'neon_account' as const : 'child' as const

  const getName = (record: NeonAccount | Child): string => {
    const first = record.first_name || ''
    const last = record.last_name || ''
    return `${first} ${last}`.trim() || '(unnamed)'
  }

  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'near-certain', label: 'Near certain' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
  ]

  // Start reviewing from a specific pair, or from the top of filtered list
  const startReviewFrom = (index: number) => {
    onStartReview(filtered as DuplicatePair<NeonAccount | Child>[], index, entityType)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setTab('contacts')} className={`px-4 py-1.5 rounded text-sm font-medium ${tab === 'contacts' ? 'bg-gray-900 text-white' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}>
          Contacts ({contactPairs.length})
        </button>
        <button onClick={() => setTab('children')} className={`px-4 py-1.5 rounded text-sm font-medium ${tab === 'children' ? 'bg-gray-900 text-white' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}>
          Children ({childPairs.length})
        </button>
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          <input type="checkbox" checked={showDismissed} onChange={e => setShowDismissed(e.target.checked)} />
          Show dismissed
        </label>
        <button onClick={scan} disabled={loading} className="px-3 py-1.5 bg-white border rounded text-sm hover:bg-gray-50 disabled:opacity-50">
          {loading ? 'Scanning...' : 'Scan'}
        </button>
      </div>

      {tab === 'children' && contactPairs.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700">
          Tip: Resolve Contact duplicates first — child matching improves after caregiver merges.
        </div>
      )}

      <StatsBar total={pairs.length} nearCertain={nearCertainCount} high={highCount} medium={mediumCount} loading={loading} />

      {filtered.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {filters.map(f => (
              <button key={f.value} onClick={() => setFilter(f.value)} className={`px-3 py-1 rounded text-xs font-medium ${filter === f.value ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:bg-gray-100'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <button
            onClick={() => startReviewFrom(0)}
            className="px-4 py-1.5 bg-gray-900 text-white rounded text-sm font-medium hover:bg-gray-800"
          >
            Start reviewing ({filtered.length})
          </button>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((pair, index) => (
          <DuplicateCard
            key={`${pair.recordA.id}-${pair.recordB.id}`}
            nameA={getName(pair.recordA)}
            nameB={getName(pair.recordB)}
            reasons={pair.reasons}
            tier={pair.tier}
            score={pair.score}
            onClick={() => startReviewFrom(index)}
          />
        ))}
        {!loading && filtered.length === 0 && pairs.length > 0 && (
          <p className="text-sm text-gray-400">No {filter} confidence duplicates.</p>
        )}
      </div>
    </div>
  )
}
