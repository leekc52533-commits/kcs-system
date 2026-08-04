import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {
  COLLECTION_FREQUENCIES,
  normalizeCollectionFrequency,
  normalizeCollectionSettings,
} from '../shared/collectionSettings.js'
import {
  buildBranchSavePayload,
  collectBranchOptionalFields,
  createBranchEditorDraft,
  formatPrice,
  priceTypeLabel,
  specialPriceEnabled,
  toggleCustomerSpecialPrice,
  updateCustomerPricingDraft,
  validateCustomerPricing,
} from '../src/branchEditorState.js'
import {syncLegacyOccPrices} from '../server/migrationV18.mjs'
import {
  createPriceLevel,
  saveCustomerMaterialPricing,
} from '../server/materialPriceService.mjs'
import {
  createBranch,
  createCustomer,
  getBranch,
  updateBranch,
} from '../server/customerMasterService.mjs'

const database = () => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys=ON')
  db.exec(schemaSql)
  syncLegacyOccPrices(db)
  return db
}

function pricingFixture(db) {
  const materialId = db.prepare("SELECT id FROM materials WHERE material_code='OCC'").get().id
  const standard = createPriceLevel(materialId, {
    priceAmount: 0.19,
    effectiveDate: '2026-07-26',
    reason: 'Standard',
  }, db)
  const outstation = createPriceLevel(materialId, {
    priceAmount: 0.17,
    effectiveDate: '2026-07-26',
    reason: 'Outstation',
  }, db)
  createCustomer({customerId: 'CHAIN', customerName: 'Ten Branch Chain'}, db)
  saveCustomerMaterialPricing('CHAIN', [{
    materialId,
    standardPriceLevelId: standard.id,
    outstationEnabled: true,
    outstationPriceLevelId: outstation.id,
  }], {changedBy: 'QA', reason: 'Continuous editor fixture'}, db)
  return {materialId}
}

test('Collection Frequency uses one canonical frontend/backend contract and gives detailed errors', () => {
  assert.deepEqual(COLLECTION_FREQUENCIES, [
    'Once a week',
    'Twice a week',
    '3 times a week',
    '4 times a week',
    'Daily',
    'Every 2 Weeks',
    'Every 3 Weeks',
    'Monthly',
    'On Call',
    'Paused',
  ])
  assert.equal(normalizeCollectionFrequency(null), null)
  assert.equal(normalizeCollectionFrequency(''), null)
  assert.equal(normalizeCollectionFrequency('Weekly'), 'Once a week')
  assert.equal(normalizeCollectionFrequency('On-call'), 'On Call')
  assert.throws(
    () => normalizeCollectionSettings('Weekly,On Call', []),
    /Invalid Collection Frequency "Weekly,On Call".*Allowed values/,
  )
})

test('price labels immediately expose Standard, Outstation and Special Price values', () => {
  const pricing = {
    standardPrice: 0.19,
    standardSpecialPrice: null,
    outstationPrice: 0.17,
    outstationSpecialPrice: null,
  }
  assert.equal(priceTypeLabel(pricing, 'standard'), 'Standard — RM0.19/kg')
  assert.equal(priceTypeLabel(pricing, 'outstation'), 'Outstation — RM0.17/kg')
  assert.equal(formatPrice(null), 'Price not configured')
  assert.equal(priceTypeLabel({...pricing, outstationSpecialPrice: 0.165}, 'outstation'), 'Special Price — RM0.17/kg')
})

test('Customer Special Price toggle is atomic, visible immediately and isolated per Material', () => {
  const original = [
    {materialId: 1, standardPriceLevelId: 10, standardSpecialPrice: ''},
    {materialId: 2, standardPriceLevelId: 20, standardSpecialPrice: ''},
  ]
  const enabled = toggleCustomerSpecialPrice(original, 0, 'standard', true)
  assert.equal(specialPriceEnabled(enabled[0], 'standard'), true)
  assert.equal(enabled[0].standardSpecialPrice, 0)
  assert.equal(enabled[0].standardPriceLevelId, '')
  assert.deepEqual(enabled[1], original[1])
  assert.deepEqual(original[0], {materialId: 1, standardPriceLevelId: 10, standardSpecialPrice: ''})

  const priced = updateCustomerPricingDraft(enabled, 0, {standardSpecialPrice: '0.285'})
  assert.doesNotThrow(() => validateCustomerPricing(priced))
  assert.equal(priced[0].standardSpecialPrice, '0.285')
  assert.deepEqual(priced[1], original[1])

  const disabled = toggleCustomerSpecialPrice(priced, 0, 'standard', false)
  assert.equal(specialPriceEnabled(disabled[0], 'standard'), false)
  assert.throws(() => validateCustomerPricing(disabled), /Standard Price is required/)
  const restored = updateCustomerPricingDraft(disabled, 0, {standardPriceLevelId: 10})
  assert.doesNotThrow(() => validateCustomerPricing(restored))
})

test('Special Price rejects invalid, negative and excessive decimal values', () => {
  const base = [{materialId: 1, standardPriceLevelId: '', standardSpecialPrice: ''}]
  for (const value of ['abc', '-0.01', '0.1234']) {
    const draft = updateCustomerPricingDraft(
      toggleCustomerSpecialPrice(base, 0, 'standard', true),
      0,
      {standardSpecialPrice: value},
    )
    assert.throws(() => validateCustomerPricing(draft), /Special Price/)
  }
})

test('Branch optional fields distinguish untouched values from an intentional blank', () => {
  const form = createBranchEditorDraft({
    branchId: 'B-1',
    branchName: 'Branch One',
    notes: 'Keep this note',
    phone: '0123456789',
  })
  const untouched = buildBranchSavePayload(form, {touchedFields: new Set()})
  assert.equal(Object.hasOwn(untouched, 'notes'), false)
  assert.equal(Object.hasOwn(untouched, 'phone'), false)

  const cleared = buildBranchSavePayload({...form, notes: ''}, {
    touchedFields: new Set(['notes']),
  })
  assert.equal(Object.hasOwn(cleared, 'notes'), true)
  assert.equal(cleared.notes, '')
  assert.equal(Object.hasOwn(cleared, 'phone'), false)
})

test('Branch form submission reads explicit blank optional values from the actual form', () => {
  const formData = new Map([
    ['address', ''],
    ['contactPerson', ''],
    ['phone', ''],
    ['collectionTimeConstraint', ''],
    ['proofRequirements', ''],
    ['vehicleRestriction', ''],
    ['notes', ''],
  ])
  const submitted = collectBranchOptionalFields(formData)
  assert.deepEqual(submitted, {
    address: '',
    contactPerson: '',
    phone: '',
    collectionTimeConstraint: '',
    proofRequirements: '',
    vehicleRestriction: '',
    notes: '',
  })
  const payload = buildBranchSavePayload(
    {...createBranchEditorDraft({branchId: 'B-1'}), ...submitted},
    {touchedFields: new Set(Object.keys(submitted))},
  )
  for (const field of Object.keys(submitted)) {
    assert.equal(Object.hasOwn(payload, field), true)
    assert.equal(payload[field], '')
  }
})

test('ten Branches can be edited continuously without carrying prior state, frequency errors or prices', () => {
  const db = database()
  const {materialId} = pricingFixture(db)
  for (let index = 1; index <= 10; index += 1) {
    createBranch({
      branchId: `CHAIN-${String(index).padStart(2, '0')}`,
      customerId: 'CHAIN',
      branchName: `Branch ${index}`,
      collectionFrequency: index % 3 === 0 ? 'Twice a week' : null,
      assignedWeekdays: index % 3 === 0 ? ['Monday', 'Thursday'] : [],
      materials: [{materialId, priceType: 'standard'}],
    }, db)
  }

  // Simulate one legacy value which the editor must not resend during a price-only update.
  db.prepare("UPDATE branches SET collection_frequency='Weekly,On Call' WHERE jodoo_branch_id='CHAIN-05'").run()

  let previousDraft
  for (let index = 1; index <= 10; index += 1) {
    const branchId = `CHAIN-${String(index).padStart(2, '0')}`
    const detail = getBranch(branchId, db)
    const draft = createBranchEditorDraft(detail)
    assert.equal(draft.branchId, branchId)
    assert.equal(draft.branchName, `Branch ${index}`)
    assert.notEqual(draft, previousDraft)
    assert.notEqual(draft.materials, previousDraft?.materials)

    const priceType = index % 2 === 0 ? 'outstation' : 'standard'
    draft.materials = [{materialId, priceType}]
    draft.notes = `saved-${index}`
    const frequencyTouched = index === 4 || index === 8
    if (frequencyTouched) {
      draft.collectionFrequency = 'Once a week'
      draft.assignedWeekdays = ['Friday']
    }
    const payload = buildBranchSavePayload(draft, {
      frequencyTouched,
      weekdaysTouched: frequencyTouched,
    })
    if (!frequencyTouched) {
      assert.equal(Object.hasOwn(payload, 'collectionFrequency'), false)
      assert.equal(Object.hasOwn(payload, 'assignedWeekdays'), false)
    }
    updateBranch(branchId, payload, db)

    const reopened = getBranch(branchId, db)
    assert.equal(reopened.branchId, branchId)
    assert.equal(reopened.notes, `saved-${index}`)
    assert.equal(reopened.materials[0].priceType, priceType)
    assert.equal(reopened.materials[0].currentPrice, priceType === 'outstation' ? 0.17 : 0.19)
    if (frequencyTouched) {
      assert.equal(reopened.collectionFrequency, 'Once a week')
      assert.deepEqual(reopened.assignedWeekdays, ['Friday'])
    }
    if (index === 5) {
      assert.equal(reopened.collectionFrequency, null)
      assert.match(reopened.frequencyNormalizationWarning, /Weekly,On Call/)
      assert.equal(db.prepare("SELECT collection_frequency value FROM branches WHERE jodoo_branch_id='CHAIN-05'").get().value, 'Weekly,On Call')
    }
    previousDraft = draft
  }
})

test('Branch modal lifecycle prevents stale data and closes only after a successful save', () => {
  const source = readFileSync(new URL('../src/MasterDataPage.jsx', import.meta.url), 'utf8')
  assert.match(source, /key=\{`branch-\$\{editing\.branchId\|\|'new'\}`\}/)
  assert.match(source, /const detail=await api\(`\$\{endpoint\}\/\$\{encodeURIComponent\(item\[idKey\]\)\}`\)/)
  assert.match(source, /await api\(url,\{method,body:JSON\.stringify/)
  assert.match(source, /setEditingState\(null\)\s+if\(await load\(\)\)notify\(/)
  assert.match(source, /catch\(item\)\{fail\(item\.message\)\}\s+finally\{setSaving\(false\)\}/)
  assert.match(source, /collectBranchOptionalFields\(new FormData\(event\.currentTarget\)\)/)
  assert.match(source, /name=\{key\}.*onInput=/)
})
