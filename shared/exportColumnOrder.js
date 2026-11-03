// Whitelist keys from the table model, never derive business data from rendered DOM.
export function exportColumnOrder(requested, keys) {
  let value = requested
  if (typeof value === 'string') { try { value = JSON.parse(value) } catch { value = [] } }
  return [...new Set([...(Array.isArray(value) ? value.filter(key => keys.includes(key)) : []), ...keys])]
}

// Reorder before adding rows, so keyed values, formats and links stay attached.
// Extra export-only detail columns remain after the on-screen columns.
export function orderedExportColumns(columns, requested, mapping = {}) {
  const keys = columns.map(column => column.key)
  let value = requested
  if (typeof value === 'string') { try { value = JSON.parse(value) } catch { value = [] } }
  const mapped = Array.isArray(value) ? value.map(key => Object.hasOwn(mapping,key) ? mapping[key] : key) : []
  return exportColumnOrder(mapped,keys).map(key => columns.find(column => column.key === key))
}
