const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
const kinds = new Set(['sales','purchases','expenses','void'])
function dateParts(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null
  const date = new Date(value + 'T00:00:00Z')
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value) return null
  return {year:value.slice(0,4), month:months[Number(value.slice(5,7))-1], day:value.slice(8,10)}
}
// Return a basename; each download path supplies its own file extension.
export function billExportFilename(kind, range = {}) {
  if (!kinds.has(kind)) throw new Error('Unsupported bill export kind')
  const from = dateParts(range.from), to = dateParts(range.to)
  if (!from || !to || range.from > range.to) return `${kind} bill`
  const end = from.year === to.year && from.month === to.month ? to.day : `${to.month}-${to.day}`
  return `${kind} bill ${from.month}-${from.day}-${end}`
}
