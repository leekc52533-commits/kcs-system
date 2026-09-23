// Quantities and measurements only: dates, phone numbers and record IDs are identifiers.
const numericKeys = new Set(['quantity', 'weight', 'weightKg', 'pendingKg', 'confirmedWeightKg', 'unitPrice', 'unitRate', 'price', 'priceAmount', 'occPrice', 'amount', 'total', 'amountLabel', 'totalLabel', 'odometerKm', 'mileage', 'tripNumber', 'rowNumber', 'row_number', 'count'])
export const isNumericColumn = key => numericKeys.has(key) || /(?:Count|_count|Cents|Kg|Cost)$/.test(key || '')
