interface Props {
  total: number
  nearCertain: number
  high: number
  medium: number
  loading: boolean
}

export function StatsBar({ total, nearCertain, high, medium, loading }: Props) {
  if (loading) return <div className="bg-white rounded-lg border px-4 py-3 text-sm text-gray-400">Scanning for duplicates...</div>
  if (total === 0) return <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">No duplicates found!</div>
  return (
    <div className="bg-white rounded-lg border px-4 py-3 text-sm flex items-center gap-3">
      <span className="font-medium">{total} potential duplicate{total !== 1 ? 's' : ''}</span>
      {nearCertain > 0 && <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded text-xs font-medium">{nearCertain} near certain</span>}
      {high > 0 && <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs font-medium">{high} high</span>}
      {medium > 0 && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs font-medium">{medium} medium</span>}
    </div>
  )
}
