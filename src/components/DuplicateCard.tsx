import type { ConfidenceTier } from '../lib/types'

const tierStyles: Record<ConfidenceTier, string> = {
  'near-certain': 'bg-red-100 text-red-800',
  'high': 'bg-orange-100 text-orange-700',
  'medium': 'bg-amber-100 text-amber-700',
  'low': 'bg-gray-100 text-gray-600',
}

const tierLabels: Record<ConfidenceTier, string> = {
  'near-certain': 'near certain',
  'high': 'high',
  'medium': 'medium',
  'low': 'low',
}

interface Props {
  nameA: string
  nameB: string
  reasons: string[]
  tier: ConfidenceTier
  score: number
  tag?: 'spouse'
  onClick: () => void
}

export function DuplicateCard({ nameA, nameB, reasons, tier, score, tag, onClick }: Props) {
  return (
    <button onClick={onClick} className="w-full text-left bg-white border rounded-lg px-4 py-3 hover:border-gray-400 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium truncate">{nameA}</span>
            <span className="text-gray-400">↔</span>
            <span className="font-medium truncate">{nameB}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {reasons.map(r => (
              <span key={r} className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{r}</span>
            ))}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          {tag === 'spouse' && (
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-100 text-blue-700">spouse</span>
          )}
          <span className="text-xs text-gray-400">{score}</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${tierStyles[tier]}`}>
            {tierLabels[tier]}
          </span>
        </div>
      </div>
    </button>
  )
}
