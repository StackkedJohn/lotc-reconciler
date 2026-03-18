export function normalizeToE164(phone: string): string {
  if (!phone) return ''
  const hasPlus = phone.startsWith('+')
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  if (hasPlus && digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  return hasPlus ? `+${digits}` : `+${digits}`
}
