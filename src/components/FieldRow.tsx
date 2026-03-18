interface Props {
  label: string
  valueA: string | null
  valueB: string | null
  selected: 'a' | 'b'
  onSelect: (side: 'a' | 'b') => void
  readOnly?: boolean
}

export function FieldRow({ label, valueA, valueB, selected, onSelect, readOnly }: Props) {
  const displayA = valueA || '—'
  const displayB = valueB || '—'
  const isDifferent = (valueA ?? '') !== (valueB ?? '')

  return (
    <tr className={isDifferent ? 'bg-yellow-50' : ''}>
      <td className="py-2 px-3 text-xs font-medium text-gray-500 w-32">{label}</td>
      <td className="py-2 px-3 text-sm">
        {readOnly ? (
          <span className={!valueA ? 'text-gray-300 italic' : ''}>{displayA}</span>
        ) : (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name={label} checked={selected === 'a'} onChange={() => onSelect('a')} className="text-gray-900" />
            <span className={!valueA ? 'text-gray-300 italic' : ''}>{displayA}</span>
          </label>
        )}
      </td>
      <td className="py-2 px-3 text-sm">
        {readOnly ? (
          <span className={!valueB ? 'text-gray-300 italic' : ''}>{displayB}</span>
        ) : (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name={label} checked={selected === 'b'} onChange={() => onSelect('b')} className="text-gray-900" />
            <span className={!valueB ? 'text-gray-300 italic' : ''}>{displayB}</span>
          </label>
        )}
      </td>
    </tr>
  )
}
