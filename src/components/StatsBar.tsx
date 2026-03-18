interface Props {
  total: number
  high: number
  medium: number
  loading: boolean
}

export function StatsBar({ total, high, medium, loading }: Props) {
  if (loading) return <div className="bg-white rounded-lg border px-4 py-3 text-sm text-gray-400">Scanning for duplicates...</div>
  if (total === 0) return <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">No duplicates found!</div>
  return (
    <div className="bg-white rounded-lg border px-4 py-3 text-sm flex items-center gap-3">
      <span className="font-medium">{total} potential duplicate{total !== 1 ? 's' : ''}</span>
      <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-medium">{high} high</span>
      <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs font-medium">{medium} medium</span>
    </div>
  )
}
