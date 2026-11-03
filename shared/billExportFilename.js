const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
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
  const title = kind[0].toUpperCase() + kind.slice(1) + ' Bill'
  const from = dateParts(range.from), to = dateParts(range.to)
  if (!from || !to || range.from > range.to) return title
  const end = from.year === to.year && from.month === to.month ? to.day : `${to.month} ${to.day}`
  return `${title} ${from.month} ${from.day}-${end}`
}
