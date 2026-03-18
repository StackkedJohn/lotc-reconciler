import { useState, useEffect } from 'react'
import { FieldRow } from './FieldRow'
import { LinkedCounts } from './LinkedCounts'
import { mergeContacts, mergeChildren, dismissDuplicate } from '../lib/api'
import type { NeonAccount, Child, DuplicatePair } from '../lib/types'

interface Props {
  pairs: DuplicatePair<NeonAccount | Child>[]
  startIndex: number
  entityType: 'neon_account' | 'child'
  userName: string
  onBack: () => void
}

// Editable fields
const CONTACT_FIELDS: { key: keyof NeonAccount; label: string }[] = [
  { key: 'first_name', label: 'First Name' }, { key: 'last_name', label: 'Last Name' },
  { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' },
  { key: 'company_name', label: 'Company' }, { key: 'address_line1', label: 'Address' },
  { key: 'city', label: 'City' }, { key: 'state', label: 'State' },
  { key: 'zip_code', label: 'Zip' }, { key: 'source', label: 'Source' },
]

// Read-only fields (displayed but not selectable)
const CONTACT_READONLY: { key: keyof NeonAccount; label: string }[] = [
  { key: 'neon_id', label: 'Neon ID' }, { key: 'individual_types', label: 'Types' },
]

const CHILD_FIELDS: { key: keyof Child; label: string }[] = [
  { key: 'first_name', label: 'First Name' }, { key: 'last_name', label: 'Last Name' },
  { key: 'nickname', label: 'Nickname' }, { key: 'date_of_birth', label: 'Date of Birth' },
  { key: 'age', label: 'Age' }, { key: 'gender', label: 'Gender' },
  { key: 'ethnicity', label: 'Ethnicity' }, { key: 'placement_type', label: 'Placement' },
  { key: 'custody_county', label: 'Custody County' }, { key: 'grade_fall', label: 'Grade (Fall)' },
]

export function MergeView({ pairs, startIndex, entityType, userName, onBack }: Props) {
  const [currentIndex, setCurrentIndex] = useState(startIndex)
  const [processed, setProcessed] = useState(0)

  const pair = pairs[currentIndex]

  // Reset selections when pair changes
  const fields = entityType === 'neon_account' ? CONTACT_FIELDS : CHILD_FIELDS
  const readonlyFields = entityType === 'neon_account' ? CONTACT_READONLY : []
  const a = pair?.recordA as any
  const b = pair?.recordB as any

  const fullnessA = pair ? fields.filter(f => a[f.key] != null && a[f.key] !== '').length : 0
  const fullnessB = pair ? fields.filter(f => b[f.key] != null && b[f.key] !== '').length : 0
  const defaultSide = fullnessA >= fullnessB ? 'a' : 'b'

  const [selections, setSelections] = useState<Record<string, 'a' | 'b'>>({})
  const [status, setStatus] = useState<'idle' | 'merging' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // Reset selections when navigating to a new pair
  useEffect(() => {
    if (pair) {
      const newDefault = fullnessA >= fullnessB ? 'a' : 'b'
      setSelections(Object.fromEntries(fields.map(f => [f.key, newDefault])))
      setStatus('idle')
      setErrorMsg('')
    }
  }, [currentIndex])

  if (!pair) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-4">&#10003;</div>
        <h2 className="text-lg font-bold mb-2">All done!</h2>
        <p className="text-sm text-gray-500 mb-4">Processed {processed} pairs this session.</p>
        <button onClick={onBack} className="px-4 py-2 bg-gray-900 text-white rounded text-sm font-medium hover:bg-gray-800">
          Back to queue
        </button>
      </div>
    )
  }

  const survivorSide = defaultSide
  const survivorId = survivorSide === 'a' ? a.id : b.id
  const loserId = survivorSide === 'a' ? b.id : a.id

  const advance = () => {
    setProcessed(p => p + 1)
    setCurrentIndex(i => i + 1)
  }

  const handleMerge = async () => {
    setStatus('merging')
    setErrorMsg('')
    const overrides: Record<string, string> = {}
    for (const f of fields) {
      const selectedSide = selections[f.key]
      if (selectedSide !== survivorSide) {
        const val = selectedSide === 'a' ? a[f.key] : b[f.key]
        if (val != null) overrides[f.key] = String(val)
      }
    }
    try {
      if (entityType === 'neon_account') await mergeContacts(survivorId, loserId, overrides, userName)
      else await mergeChildren(survivorId, loserId, overrides, userName)
      advance()
    } catch (err: any) {
      setStatus('error')
      setErrorMsg(err.message || 'Merge failed')
    }
  }

  const handleDismiss = async () => {
    setStatus('merging')
    try {
      await dismissDuplicate(entityType, a.id, b.id, userName)
      advance()
    } catch (err: any) {
      setStatus('error')
      setErrorMsg(err.message || 'Dismiss failed')
    }
  }

  const handleSkip = () => advance()

  const formatValue = (val: any): string | null => {
    if (val == null) return null
    if (Array.isArray(val)) return val.join(', ')
    return String(val)
  }

  return (
    <div>
      {/* Progress bar + navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700">&larr; Back to queue</button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {currentIndex + 1} of {pairs.length}
          </span>
          <div className="w-32 bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-gray-900 h-1.5 rounded-full transition-all"
              style={{ width: `${((currentIndex + 1) / pairs.length) * 100}%` }}
            />
          </div>
          {processed > 0 && (
            <span className="text-xs text-green-600 font-medium">{processed} done</span>
          )}
        </div>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
            pair.tier === 'near-certain' ? 'bg-red-100 text-red-800' :
            pair.tier === 'high' ? 'bg-orange-100 text-orange-700' :
            'bg-amber-100 text-amber-700'
          }`}>
            {pair.tier === 'near-certain' ? 'near certain' : pair.tier} ({pair.score})
          </span>
          <span className="text-sm text-gray-600">{pair.reasons.join(' · ')}</span>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="py-2 px-3 text-left text-xs font-medium text-gray-400">Field</th>
              <th className="py-2 px-3 text-left text-xs font-medium text-gray-400">
                Record A {survivorSide === 'a' && <span className="text-green-600">(fuller)</span>}
              </th>
              <th className="py-2 px-3 text-left text-xs font-medium text-gray-400">
                Record B {survivorSide === 'b' && <span className="text-green-600">(fuller)</span>}
              </th>
            </tr>
          </thead>
          <tbody>
            {fields.map(f => (
              <FieldRow key={f.key} label={f.label} valueA={formatValue(a[f.key])} valueB={formatValue(b[f.key])}
                selected={selections[f.key] || defaultSide} onSelect={side => setSelections(s => ({ ...s, [f.key]: side }))} />
            ))}
            {readonlyFields.map(f => (
              <FieldRow key={f.key} label={f.label} valueA={formatValue(a[f.key])} valueB={formatValue(b[f.key])}
                selected="a" onSelect={() => {}} readOnly />
            ))}
          </tbody>
        </table>

        {entityType === 'neon_account' && (
          <div className="px-4 py-3 border-t grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-400 mb-1">Record A linked to:</p>
              <LinkedCounts accountId={a.id} neonId={a.neon_id} entityType={entityType} />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 mb-1">Record B linked to:</p>
              <LinkedCounts accountId={b.id} neonId={b.neon_id} entityType={entityType} />
            </div>
          </div>
        )}

        <div className="px-4 py-3 border-t bg-gray-50 flex items-center gap-3">
          <button onClick={handleMerge} disabled={status === 'merging'}
            className="px-4 py-2 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50">
            {status === 'merging' ? 'Merging...' : 'Merge'}
          </button>
          <button onClick={handleDismiss} disabled={status === 'merging'}
            className="px-4 py-2 bg-white border rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
            Not a Duplicate
          </button>
          <button onClick={handleSkip} disabled={status === 'merging'}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50">
            Skip &rarr;
          </button>
          {status === 'error' && <span className="text-sm text-red-600 ml-auto">{errorMsg}</span>}
        </div>
      </div>
    </div>
  )
}
