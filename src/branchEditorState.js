import {
  normalizeCollectionFrequency,
  parseCollectionWeekdays,
} from '../shared/collectionSettings.js'

export function createBranchEditorDraft(initial = {}) {
  return {
    ...initial,
    collectionFrequency: normalizeCollectionFrequency(initial.collectionFrequency, {strict: false}) ?? '',
    assignedWeekdays: parseCollectionWeekdays(initial.assignedWeekdays, {strict: false}),
    materials: (initial.materials || []).map(item => ({
      ...item,
      priceType: item.priceType === 'outstation' ? 'outstation' : 'standard',
    })),
  }
}

export function buildBranchSavePayload(form, {frequencyTouched = false, weekdaysTouched = false} = {}) {
  const payload = {
    ...form,
    materials: (form.materials || []).map(item => ({...item})),
    assignedWeekdays: [...(form.assignedWeekdays || [])],
  }
  if (!frequencyTouched && !weekdaysTouched) {
    delete payload.collectionFrequency
    delete payload.assignedWeekdays
  }
  return payload
}

export function formatPrice(price) {
  return price !== null && price !== undefined && price !== '' && Number.isFinite(Number(price))
    ? `RM${Number(price).toFixed(2)}/kg`
    : 'Price not configured'
}

export function pricingValue(pricing, priceType = 'standard') {
  if (!pricing) return {price: null, special: false}
  const outstation = priceType === 'outstation'
  return {
    price: outstation ? pricing.outstationPrice : pricing.standardPrice,
    special: (outstation ? pricing.outstationSpecialPrice : pricing.standardSpecialPrice) != null,
  }
}

export function priceTypeLabel(pricing, priceType = 'standard') {
  const typeLabel = priceType === 'outstation' ? 'Outstation' : 'Standard'
  const {price, special} = pricingValue(pricing, priceType)
  return `${special ? 'Special Price' : typeLabel} — ${formatPrice(price)}`
}
