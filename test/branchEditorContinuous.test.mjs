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
  createBranchEditorDraft,
  formatPrice,
  priceTypeLabel,
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
})
