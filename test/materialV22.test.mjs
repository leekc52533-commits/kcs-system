import assert from 'node:assert/strict'
import test from 'node:test'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {seedFixedOccPriceGroups} from '../server/migrationV21.mjs'
import {applyV22Migration,BASE_PRODUCT_CODES} from '../server/migrationV22.mjs'
import {ensureV24Tables} from '../server/migrationV24.mjs'
import {runApprovedCustomerProductPricingBatch} from '../server/customerProductPricingBatchService.mjs'
import {listBranchProducts,listCustomerProductPricing,materialIssueReport,requireBranchProductPrice,saveCustomerProductPricing} from '../server/materialProductService.mjs'
import {runMaterialConversion} from '../server/materialConversionService.mjs'
import {materialDisplayName} from '../shared/materialDisplay.js'

function fixture({branchCount=2}={}){
  const database=new DatabaseSync(':memory:')
  database.exec(`PRAGMA foreign_keys=ON;${schemaSql}`)
  database.prepare('INSERT INTO schema_meta(version) VALUES(21)').run()
  database.prepare(`INSERT INTO materials(material_code,material_name,unit,status,created_by)
    VALUES('OCC','OCC','kg','active','test'),('BRISTOL_PAPER','Bristol Paper','kg','active','test'),
      ('ALUMINUM_CAN','Aluminum Can','kg','active','test'),('PLASTIC','Plastic','kg','active','test'),('IRON','Iron','kg','active','test')`).run()
  database.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C-FIXTURE','Fixture Customer')").run()
  const addBranch=database.prepare('INSERT INTO branches(jodoo_branch_id,customer_id,branch_name) VALUES(?,1,?)')
  for(let index=1;index<=branchCount;index+=1)addBranch.run(String(10000+index),`Branch ${index}`)
  seedFixedOccPriceGroups(database)
  return database
}


function selectCustomerBaseMaterials(database,price=.5){
  const materialIds=database.prepare(`SELECT DISTINCT p.material_id id FROM material_products p WHERE p.product_code IN (${BASE_PRODUCT_CODES.map(()=>'?').join(',')})`).all(...BASE_PRODUCT_CODES).map(row=>row.id)
  for(const materialId of materialIds)database.prepare("INSERT INTO customer_material_pricing(customer_id,material_id,standard_special_price,price_type,updated_by) VALUES(1,?,?,'standard','test')").run(materialId,price)
}

test('v21 upgrades to v22 and repeated migration is idempotent',()=>{
  const database=fixture({branchCount:475})
  const first=applyV22Migration(database),second=applyV22Migration(database)
  assert.equal(first.schemaVersion,22)
  assert.equal(second.schemaVersion,22)
  assert.equal(database.prepare('SELECT MAX(version) version FROM schema_meta').get().version,22)
  assert.equal(first.nonOccFixedPriceGroupCount,21)
  assert.equal(database.prepare('SELECT COUNT(*) count FROM material_price_levels WHERE is_fixed=1 AND product_id IS NOT NULL').get().count,21)
  assert.equal(database.prepare('SELECT COUNT(*) count FROM branch_product_availability').get().count,2375)
  assert.equal(second.baseAvailabilityCreated,0)
  assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check,'ok')
})

test('material hierarchy keeps G1 and G2 as distinct Iron products',()=>{
  const database=fixture()
  applyV22Migration(database)
  const rows=database.prepare(`SELECT m.material_code,p.product_code,p.full_name,p.short_form,p.unit
    FROM material_products p JOIN materials m ON m.id=p.material_id WHERE p.product_code IN ('G1','G2') ORDER BY p.product_code`).all()
  assert.deepEqual(rows.map(row=>row.material_code),['IRON','IRON'])
  assert.deepEqual(rows.map(row=>row.product_code),['G1','G2'])
  assert.deepEqual(rows.map(row=>row.full_name),['Scrap Iron G1','Scrap Iron G2'])
  assert.equal(new Set(rows.map(row=>row.product_code)).size,2)
  assert.equal(database.prepare(`SELECT COUNT(DISTINCT price_cents) count FROM material_price_levels pl
    JOIN material_products p ON p.id=pl.product_id WHERE p.product_code IN ('G1','G2')`).get().count,2)
})

test('v22 master contains 19 non-OCC products, 21 groups and controlled units',()=>{
  const database=fixture()
  applyV22Migration(database)
  const products=database.prepare("SELECT product_code,unit FROM material_products WHERE product_code<>'OCC'").all()
  assert.equal(products.length,19)
  assert.equal(products.filter(row=>row.unit==='piece').length,2)
  assert.deepEqual(products.filter(row=>row.unit==='piece').map(row=>row.product_code).sort(),['AIR_CONDITIONER','TV_MONITOR'])
  assert.equal(products.filter(row=>row.unit==='kg').length,17)
  assert.equal(database.prepare('SELECT COUNT(*) count FROM material_price_levels WHERE product_id IS NOT NULL AND is_fixed=1').get().count,21)
  assert.equal(database.prepare(`SELECT COUNT(*) count FROM (
    SELECT product_id,price_cents FROM material_price_levels WHERE product_id IS NOT NULL AND is_fixed=1
    GROUP BY product_id,price_cents HAVING COUNT(*)>1)`).get().count,0)
})

test('every current and newly created Branch receives five selectable base products without invented prices',()=>{const database=fixture({branchCount:3});applyV22Migration(database);selectCustomerBaseMaterials(database);for(const branch of database.prepare('SELECT id FROM branches').all()){const products=listBranchProducts(branch.id,database).filter(row=>BASE_PRODUCT_CODES.includes(row.productCode));assert.equal(products.length,5);assert.equal(products.every(row=>row.isSelectable),true);assert.equal(products.every(row=>row.currentPrice===.5),true)}database.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name) VALUES('NEW-1',1,'New Branch')").run();assert.equal(listBranchProducts('NEW-1',database).filter(row=>BASE_PRODUCT_CODES.includes(row.productCode)).length,5);assert.equal(database.prepare("SELECT COUNT(*) n FROM branch_material_price_selections").get().n,0)})

test('missing product price remains selectable and cannot silently become RM0.00',()=>{const database=fixture({branchCount:1});applyV22Migration(database);const g1=database.prepare("SELECT id FROM material_products WHERE product_code='G1'").get();assert.equal(listBranchProducts('10001',database).some(row=>row.productCode==='G1'),false);assert.throws(()=>requireBranchProductPrice('10001',g1.id,database),/not selectable/);assert.equal(database.prepare('SELECT COUNT(*) n FROM branch_material_price_selections').get().n,0)})

test('Product pricing overrides shared Material pricing so Iron G1 and G2 can differ',()=>{
  const database=fixture({branchCount:1});applyV22Migration(database);selectCustomerBaseMaterials(database)
  const products=database.prepare("SELECT id,product_code FROM material_products WHERE product_code IN ('G1','G2') ORDER BY product_code").all()
  const items=products.map(product=>({productId:product.id,standardPriceLevelId:database.prepare('SELECT id FROM material_price_levels WHERE product_id=?').get(product.id).id}))
  const saved=saveCustomerProductPricing('C-FIXTURE',items,{changedBy:'KC',reason:'Approved grades',runId:'iron-grades'},database)
  assert.equal(saved.changedCount,2)
  const g1=products.find(product=>product.product_code==='G1'),g2=products.find(product=>product.product_code==='G2')
  database.prepare('UPDATE material_price_levels SET price_amount=.6,price_cents=60 WHERE product_id=?').run(g1.id)
  const rows=listBranchProducts('10001',database).filter(row=>['G1','G2'].includes(row.productCode)).sort((a,b)=>a.productCode.localeCompare(b.productCode))
  assert.deepEqual(rows.map(row=>[row.productCode,row.currentPrice]),[['G1',.6],['G2',.4]])
  assert.equal(database.prepare("SELECT COUNT(*) n FROM material_conversion_audit WHERE run_id='iron-grades'").get().n,2)
  const wrong=database.prepare('SELECT id FROM material_price_levels WHERE product_id=?').get(g2.id)
  assert.throws(()=>saveCustomerProductPricing('C-FIXTURE',[{productId:g1.id,standardPriceLevelId:wrong.id}],{reason:'Wrong link'},database),/does not belong/)
})

test('approved Product batch previews, applies and reruns without changing OCC',()=>{
  const database=fixture({branchCount:1});applyV22Migration(database);ensureV24Tables(database)
  const occ=database.prepare("SELECT id FROM materials WHERE material_code='OCC'").get()
  database.prepare("INSERT INTO customer_material_pricing(customer_id,material_id,standard_special_price,price_type,resolution_state,status,updated_by) VALUES(1,?,.17,'standard','ready','active','KC')").run(occ.id)
  const can=database.prepare("SELECT id FROM material_products WHERE product_code='ALUMINUM_CAN'").get(),low=database.prepare('SELECT id FROM material_price_levels WHERE product_id=? AND price_cents=450').get(can.id)
  database.prepare("INSERT INTO customer_product_pricing(customer_id,product_id,standard_price_level_id,status,updated_by) VALUES(1,?,?,'active','legacy')").run(can.id,low.id)
  const occBefore=JSON.stringify(database.prepare('SELECT * FROM customer_material_pricing').all())
  const preview=runApprovedCustomerProductPricingBatch(database,{expectedTargetCount:1})
  assert.deepEqual({mode:preview.mode,inserts:preview.inserts,updates:preview.updates,g1PriceChange:preview.g1PriceChange},{mode:'DRY_RUN',inserts:18,updates:1,g1PriceChange:true})
  assert.equal(database.prepare('SELECT price_cents FROM material_price_levels WHERE product_id=(SELECT id FROM material_products WHERE product_code=\'G1\')').get().price_cents,50)
  const applied=runApprovedCustomerProductPricingBatch(database,{apply:true,expectedTargetCount:1})
  assert.deepEqual({ok:applied.ok,changed:applied.changedConnections,final:applied.finalConnections,history:applied.priceHistoryAdded},{ok:true,changed:19,final:19,history:1})
  assert.equal(JSON.stringify(database.prepare('SELECT * FROM customer_material_pricing').all()),occBefore)
  const branchProducts=listBranchProducts('10001',database),g1=branchProducts.find(item=>item.productCode==='G1'),g2=branchProducts.find(item=>item.productCode==='G2'),aluminum=branchProducts.find(item=>item.productCode==='ALUMINUM_CAN')
  assert.deepEqual([g1.currentPrice,g2.currentPrice,aluminum.currentPrice],[.6,.4,5])
  const customerProducts=listCustomerProductPricing('C-FIXTURE',database).items
  assert.equal(customerProducts.length,20)
  assert.deepEqual(customerProducts.filter(item=>['G1','G2'].includes(item.productCode)).map(item=>[item.productCode,item.standardPrice]),[['G1',.6],['G2',.4]])
  const repeated=runApprovedCustomerProductPricingBatch(database,{apply:true,expectedTargetCount:1})
  assert.deepEqual({changed:repeated.changedConnections,history:repeated.priceHistoryAdded},{changed:0,history:0})
})

test('material issue report finds missing base products, missing prices and wrong product links',()=>{const database=fixture({branchCount:2});applyV22Migration(database);selectCustomerBaseMaterials(database);const g1=database.prepare("SELECT id FROM material_products WHERE product_code='G1'").get(),g2=database.prepare("SELECT id FROM material_products WHERE product_code='G2'").get(),g2Level=database.prepare('SELECT id FROM material_price_levels WHERE product_id=?').get(g2.id);database.prepare('INSERT INTO customer_product_pricing(customer_id,product_id,standard_price_level_id,updated_by) VALUES(1,?,?,?)').run(g1.id,g2Level.id,'legacy');const report=materialIssueReport(database);assert.equal(report.summary.expectedBaseRelations,10);assert.equal(report.summary.actualBaseRelations,10);assert.equal(report.summary.missingRelations,0);assert.equal(report.summary.wrongPriceLinks,1);assert.equal(report.coverage.find(row=>row.productCode==='G1').missingBranches,0)})

test('display names use full form for management and short form for compact printing',()=>{
  assert.equal(materialDisplayName({fullName:'Scrap Iron G1',shortForm:'G1'}),'Scrap Iron G1 (G1)')
  assert.equal(materialDisplayName({fullName:'Scrap Iron G1',shortForm:'G1'},{compact:true}),'G1')
  assert.equal(materialDisplayName({fullName:'Bristol Paper',shortForm:''},{compact:true}),'Bristol Paper')
})

test('converter dry-run writes nothing; apply preserves history and second apply is idempotent',()=>{
  const database=fixture({branchCount:2})
  applyV22Migration(database)
  database.prepare("UPDATE branches SET customer_id=NULL,source_customer_id='LEGACY-C' WHERE jodoo_branch_id='10001'").run()
  database.prepare(`INSERT INTO dispatches(dispatch_date,status) VALUES('2026-07-30','draft')`).run()
  const occPlan=[
    {branchId:'10001',selectedPrice:.18,category:'LATEST_DATED'},
    {branchId:'10002',selectedPrice:null,category:'MANUAL_REQUIRED'},
  ]
  const nonOccAssignments=[
    {sourceRowId:'SRC-1',customerId:'C-FIXTURE',legacyItemId:'10024',legacyName:'ALUMININUM ANGLE',price:3.8},
    {sourceRowId:'SRC-2',customerId:'C-FIXTURE',legacyItemId:'10029',legacyName:'ALUMINIUM ANGLE',price:5},
    {sourceRowId:'SRC-3',customerId:'C-FIXTURE',legacyItemId:'10003',legacyName:'G1',price:.5},
  ]
  const before=JSON.stringify({
    occ:database.prepare('SELECT COUNT(*) count FROM branch_occ_price_assignments').get().count,
    pricing:database.prepare('SELECT COUNT(*) count FROM customer_product_pricing').get().count,
    history:database.prepare('SELECT COUNT(*) count FROM dispatches').get().count,
  })
  const customerMappings=[{legacyCustomerId:'LEGACY-C',targetCustomerId:'C-FIXTURE'}]
  nonOccAssignments[0].customerId='LEGACY-C'
  nonOccAssignments[1].customerId='LEGACY-C'
  const preview=runMaterialConversion(database,{occPlan,nonOccAssignments,customerMappings})
  assert.equal(preview.mode,'DRY_RUN')
  assert.equal(preview.occPreviewCount,1)
  assert.equal(preview.nonOccLegacyRows,3)
  assert.equal(preview.nonOccCurrentConnections,2)
  assert.equal(preview.nonOccReconciliation.legacySources,3)
  assert.equal(preview.nonOccReconciliation.merges.length,1)
  assert.equal(preview.nonOccReconciliation.merges[0].productCode,'ALUMINIUM_ANGLE')
  assert.equal(preview.nonOccReconciliation.merges[0].reduction,1)
  assert.deepEqual(preview.customerMappingPlan,[{legacyCustomerId:'LEGACY-C',targetCustomerId:'C-FIXTURE',branchId:'10001',requiresUpdate:true}])
  assert.equal(preview.databaseWrites,0)
  assert.equal(JSON.stringify({
    occ:database.prepare('SELECT COUNT(*) count FROM branch_occ_price_assignments').get().count,
    pricing:database.prepare('SELECT COUNT(*) count FROM customer_product_pricing').get().count,
    history:database.prepare('SELECT COUNT(*) count FROM dispatches').get().count,
  }),before)
  const first=runMaterialConversion(database,{occPlan,nonOccAssignments,customerMappings,apply:true})
  assert.equal(first.changes.customerLinks,1)
  assert.equal(first.changes.occ,1)
  assert.equal(first.changes.nonOcc,2)
  assert.equal(first.changes.legacyAudits,3)
  assert.equal(first.historicalModified,0)
  const angle=database.prepare(`SELECT pl.price_cents FROM customer_product_pricing cpp
    JOIN material_products p ON p.id=cpp.product_id JOIN material_price_levels pl ON pl.id=cpp.standard_price_level_id
    WHERE p.product_code='ALUMINIUM_ANGLE'`).get()
  assert.equal(angle.price_cents,500)
  const source=JSON.parse(database.prepare(`SELECT legacy_source_json source FROM customer_product_pricing cpp
    JOIN material_products p ON p.id=cpp.product_id WHERE p.product_code='ALUMINIUM_ANGLE'`).get().source)
  assert.equal(source.legacyCustomerId,'LEGACY-C')
  assert.equal(source.targetCustomerId,'C-FIXTURE')
  assert.equal(database.prepare("SELECT customer_id FROM branches WHERE jodoo_branch_id='10001'").get().customer_id,1)
  const second=runMaterialConversion(database,{occPlan,nonOccAssignments,customerMappings,apply:true})
  assert.deepEqual(second.changes,{customerLinks:0,occ:0,nonOcc:0,availability:0,legacyAudits:0,audit:0})
  assert.equal(second.databaseWrites,0)
  assert.equal(database.prepare("SELECT COUNT(*) count FROM material_conversion_audit WHERE entity_type='legacy_item_assignment'").get().count,3)
  assert.equal(database.prepare('SELECT COUNT(*) count FROM dispatches').get().count,1)
  assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check,'ok')
})

test('apply refuses unresolved legacy Customer mappings without partial writes',()=>{
  const database=fixture({branchCount:1})
  applyV22Migration(database)
  const assignments=[{customerId:'MISSING',legacyItemId:'10040',legacyName:'OLD SCRAPPED',price:.1}]
  const preview=runMaterialConversion(database,{nonOccAssignments:assignments})
  assert.equal(preview.nonOccConflicts.length,1)
  assert.equal(preview.databaseWrites,0)
  assert.throws(()=>runMaterialConversion(database,{nonOccAssignments:assignments,apply:true}),/blocked by 1 unresolved/)
  assert.equal(database.prepare('SELECT COUNT(*) count FROM customer_product_pricing').get().count,0)
  assert.equal(database.prepare('SELECT COUNT(*) count FROM material_conversion_audit').get().count,0)
})

test('approved Customer mapping preserves both All Scrapped sources while creating one current connection',()=>{
  const database=fixture({branchCount:2})
  applyV22Migration(database)
  database.prepare("UPDATE branches SET customer_id=NULL,source_customer_id='LEGACY-C' WHERE jodoo_branch_id='10002'").run()
  const assignments=[
    {sourceRowId:'ANGLE-OLD',customerId:'C-FIXTURE',legacyItemId:'10024',legacyName:'ALUMININUM ANGLE',price:3.8},
    {sourceRowId:'ANGLE-CURRENT',customerId:'C-FIXTURE',legacyItemId:'10029',legacyName:'ALUMINIUM ANGLE',price:5},
    {sourceRowId:'SCRAP-LEGACY',customerId:'LEGACY-C',legacyItemId:'10040',legacyName:'OLD SCRAPPED',price:.1},
    {sourceRowId:'SCRAP-CURRENT',customerId:'C-FIXTURE',legacyItemId:'10040',legacyName:'OLD SCRAPPED',price:.1},
  ]
  const customerMappings=[{legacyCustomerId:'LEGACY-C',targetCustomerId:'C-FIXTURE'}]
  const preview=runMaterialConversion(database,{nonOccAssignments:assignments,customerMappings})
  assert.equal(preview.nonOccReconciliation.legacySources,4)
  assert.equal(preview.nonOccReconciliation.uniqueConnections,2)
  assert.deepEqual(preview.nonOccReconciliation.merges.map(item=>[item.productCode,item.reduction]).sort(),[
    ['ALL_SCRAPPED',1],['ALUMINIUM_ANGLE',1],
  ])
  const applied=runMaterialConversion(database,{nonOccAssignments:assignments,customerMappings,apply:true})
  assert.equal(applied.changes.legacyAudits,4)
  assert.equal(applied.changes.nonOcc,2)
  assert.equal(database.prepare(`SELECT COUNT(*) count FROM customer_product_pricing cpp
    JOIN material_products p ON p.id=cpp.product_id WHERE cpp.customer_id=1 AND p.product_code='ALL_SCRAPPED'`).get().count,1)
  const allScrappedSource=JSON.parse(database.prepare(`SELECT cpp.legacy_source_json source FROM customer_product_pricing cpp
    JOIN material_products p ON p.id=cpp.product_id WHERE cpp.customer_id=1 AND p.product_code='ALL_SCRAPPED'`).get().source)
  assert.equal(allScrappedSource.sources.length,2)
  assert.deepEqual(allScrappedSource.sources.map(item=>item.sourceRowId).sort(),['SCRAP-CURRENT','SCRAP-LEGACY'])
  assert.equal(database.prepare("SELECT COUNT(*) count FROM material_conversion_audit WHERE entity_type='legacy_item_assignment'").get().count,4)
  assert.equal(database.prepare("SELECT customer_id FROM branches WHERE jodoo_branch_id='10002'").get().customer_id,1)
})
