import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  accountId: string
  neonId: string
  entityType: 'neon_account' | 'child'
}

export function LinkedCounts({ accountId, neonId, entityType }: Props) {
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    async function fetch() {
      if (entityType === 'neon_account') {
        const [children, submissions, donations] = await Promise.all([
          supabase.from('children').select('id', { count: 'exact', head: true })
            .or(`caregiver_id.eq.${accountId},social_worker_id.eq.${accountId}`),
          supabase.from('submissions').select('id', { count: 'exact', head: true })
            .or(`neon_caregiver_id.eq.${neonId},neon_social_worker_id.eq.${neonId}`),
          supabase.from('neon_donations').select('id', { count: 'exact', head: true })
            .eq('account_neon_id', neonId),
        ])
        setCounts({ children: children.count ?? 0, submissions: submissions.count ?? 0, donations: donations.count ?? 0 })
      } else {
        const [submissions, serviceRecords] = await Promise.all([
          supabase.from('submissions').select('id', { count: 'exact', head: true }).eq('child_id', accountId),
          supabase.from('child_service_records').select('id', { count: 'exact', head: true }).eq('child_id', accountId),
        ])
        setCounts({ submissions: submissions.count ?? 0, 'service records': serviceRecords.count ?? 0 })
      }
    }
    fetch()
  }, [accountId, neonId, entityType])

  return (
    <div className="flex gap-3 text-xs text-gray-500 mt-2">
      {Object.entries(counts).map(([key, val]) => (
        <span key={key}><span className="font-medium text-gray-700">{val}</span> {key}</span>
      ))}
    </div>
  )
}
