import {
  normalizeCollectionFrequency,
  parseCollectionWeekdays,
} from '../shared/collectionSettings.js'

export const BRANCH_OPTIONAL_TEXT_FIELDS = [
  'address',
  'contactPerson',
  'phone',
  'collectionTimeConstraint',
  'proofRequirements',
  'vehicleRestriction',
  'notes',
]

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

export function buildBranchSavePayload(form, {
  frequencyTouched = false,
  weekdaysTouched = false,
  touchedFields,
} = {}) {
  const payload = {
    ...form,
    assignedWeekdays: [...(form.assignedWeekdays || [])],
  }
  delete payload.materials
  delete payload.occPrice
  delete payload.occPriceGroupId
  for (const field of ['lifecycleStatus','statusReason','statusChangedAt','statusChangedBy','replacedByBranchId','replacedByBranchInternalId','replacedByBranchName','audit']) delete payload[field]
  if (!frequencyTouched && !weekdaysTouched) {
    delete payload.collectionFrequency
    delete payload.assignedWeekdays
  }
  if (touchedFields) {
    for (const field of BRANCH_OPTIONAL_TEXT_FIELDS) {
      if (!touchedFields.has(field)) delete payload[field]
    }
  }
  return payload
}

export function collectBranchOptionalFields(formData) {
  const fields = {}
  for (const field of BRANCH_OPTIONAL_TEXT_FIELDS) {
    if (formData.has(field)) fields[field] = formData.get(field)
  }
  return fields
}

export function updateCustomerPricingDraft(items, index, patch) {
  return (items || []).map((item, itemIndex) => itemIndex === index
    ? {
        ...item,
        ...patch,
        ...(Object.hasOwn(patch, 'materialId')
          ? {
              standardPriceLevelId: '',
              standardSpecialPrice: '',
              outstationEnabled: false,
              outstationPriceLevelId: '',
              outstationSpecialPrice: '',
            }
          : {}),
      }
    : item)
}

export function specialPriceEnabled(item, prefix) {
  const value = item?.[`${prefix}SpecialPrice`]
  return value !== '' && value != null
}

export function toggleCustomerSpecialPrice(items, index, prefix, enabled) {
  return updateCustomerPricingDraft(items, index, {
    [`${prefix}SpecialPrice`]: enabled ? 0 : '',
    ...(enabled ? {[`${prefix}PriceLevelId`]: ''} : {}),
  })
}

const customerPricingComparable=item=>({materialId:Number(item.materialId),priceType:item.priceType==='outstation'?'outstation':'standard',standardPriceLevelId:Number(item.standardPriceLevelId)||null,standardSpecialPrice:item.standardSpecialPrice===''||item.standardSpecialPrice==null?null:Number(item.standardSpecialPrice),standardEffectiveDate:String(item.standardEffectiveDate||''),outstationEnabled:Boolean(item.outstationEnabled),outstationPriceLevelId:Number(item.outstationPriceLevelId)||null,outstationSpecialPrice:item.outstationSpecialPrice===''||item.outstationSpecialPrice==null?null:Number(item.outstationSpecialPrice),outstationEffectiveDate:String(item.outstationEffectiveDate||'')})
export function customerPricingDraftHasDelta(initial,draft,removedMaterialIds=[]){
  if((removedMaterialIds||[]).map(Number).filter(Boolean).length)return true
  const normalize=items=>(items||[]).map(customerPricingComparable).sort((a,b)=>a.materialId-b.materialId)
  return JSON.stringify(normalize(initial))!==JSON.stringify(normalize(draft))
}

export function validateSpecialPrice(value, label = 'Special Price') {
  const raw = String(value ?? '').trim()
  const number = Number(raw)
  if (!raw || !Number.isFinite(number)) throw new Error(`${label} must be a valid number`)
  if (number < 0) throw new Error(`${label} cannot be negative`)
  const decimals = raw.includes('.') ? raw.split('.')[1].length : 0
  if (decimals > 3) throw new Error(`${label} supports up to 3 decimal places`)
  return number
}

export function validateCustomerPricing(items) {
  for (const item of items || []) {
    for (const prefix of item.outstationEnabled ? ['standard', 'outstation'] : ['standard']) {
      const label = `${prefix === 'outstation' ? 'Outstation' : 'Standard'} Special Price`
      if (specialPriceEnabled(item, prefix)) validateSpecialPrice(item[`${prefix}SpecialPrice`], label)
      else if (!item[`${prefix}PriceLevelId`]) throw new Error(`${prefix === 'outstation' ? 'Outstation' : 'Standard'} Price is required`)
    }
  }
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
