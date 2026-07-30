import crypto from 'node:crypto'

const cents=value=>Math.round(Number(value)*100)
const tableCount=(database,table)=>database.prepare(`SELECT COUNT(*) count FROM "${table}"`).get().count
const historicalTables=['dispatch_stop_material_prices','dispatch_stops','dispatches','material_price_history','branch_material_price_history']

function validate(database){
  const schema=Number(database.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(schema!==22)throw new Error(`Schema v22 is required; current schema is v${schema}`)
  const integrity=database.prepare('PRAGMA integrity_check').get().integrity_check
  if(integrity!=='ok')throw new Error(`Database integrity check failed: ${integrity}`)
}

function uniqueOccGroup(database,price){
  const rows=database.prepare(`SELECT g.id FROM occ_price_groups g JOIN materials m ON m.id=g.material_id
    WHERE m.material_code='OCC' AND ROUND(g.price_amount*100)=?`).all(cents(price))
  if(rows.length!==1)throw new Error(`Expected exactly one OCC Price Group for RM${Number(price).toFixed(2)}; found ${rows.length}`)
  return rows[0].id
}

function customerMappingMap(customerMappings){
  const map=new Map()
  for(const item of customerMappings){
    const legacy=String(item.legacyCustomerId||'').trim(),target=String(item.targetCustomerId||'').trim()
    if(!legacy||!target)throw new Error('Customer mapping requires legacyCustomerId and targetCustomerId')
    if(map.has(legacy)&&map.get(legacy)!==target)throw new Error(`Conflicting Customer mappings for ${legacy}`)
    map.set(legacy,target)
  }
  return map
}

function resolvedNonOcc(assignments,database,mappings){
  const grouped=new Map(),conflicts=[],auditSources=[]
  for(const [sourceIndex,row] of assignments.entries()){
    if(!row.customerId||!row.legacyItemId)continue
    const mapping=database.prepare(`SELECT lm.*,p.product_code productCode FROM legacy_item_product_mappings lm
      JOIN material_products p ON p.id=lm.product_id WHERE lm.legacy_item_id=?`).get(String(row.legacyItemId))
    if(!mapping){conflicts.push({...row,reason:'LEGACY_ITEM_NOT_MAPPED'});continue}
    const legacyCustomerId=String(row.customerId),targetExternalCustomerId=mappings.get(legacyCustomerId)||legacyCustomerId
    const customer=database.prepare('SELECT id FROM customers WHERE jodoo_customer_id=?').get(targetExternalCustomerId)
    if(!customer){conflicts.push({...row,productCode:mapping.productCode,targetCustomerId:targetExternalCustomerId,reason:'CUSTOMER_NOT_FOUND'});continue}
    const level=database.prepare(`SELECT id FROM material_price_levels WHERE product_id=? AND price_cents=? AND is_fixed=1`).all(mapping.product_id,cents(row.price))
    if(level.length!==1)throw new Error(`Expected one fixed Price Group for ${mapping.productCode} RM${Number(row.price).toFixed(2)}; found ${level.length}`)
    const source={sourceRowId:String(row.sourceRowId||row.dataId||`${legacyCustomerId}:${row.legacyItemId}:${row.price}:${sourceIndex}`),legacyCustomerId,targetCustomerId:targetExternalCustomerId,legacyItemId:String(row.legacyItemId),legacyName:row.legacyName,price:Number(row.price),productCode:mapping.productCode}
    auditSources.push(source)
    const key=`${customer.id}:${mapping.product_id}`,candidate={customerId:customer.id,externalCustomerId:targetExternalCustomerId,legacyCustomerId,customerMapped:legacyCustomerId!==targetExternalCustomerId,productId:mapping.product_id,productCode:mapping.productCode,priceLevelId:level[0].id,price:Number(row.price),legacyItemId:String(row.legacyItemId),legacyName:row.legacyName,preferred:Boolean(mapping.preferred_for_product),sources:[source]}
    const existing=grouped.get(key)
    if(!existing||(!existing.preferred&&candidate.preferred))grouped.set(key,candidate)
    else if(existing.preferred===candidate.preferred&&existing.priceLevelId!==candidate.priceLevelId)throw new Error(`Ambiguous current Price Group for Customer ${row.customerId} Product ${mapping.productCode}`)
    if(existing){
      const selected=grouped.get(key)
      if(selected===candidate)selected.sources=[...existing.sources,...candidate.sources]
      else selected.sources.push(source)
    }
  }
  return{rows:[...grouped.values()],conflicts,auditSources}
}

function resolveCustomerLinks(database,mappings){
  const rows=[],conflicts=[]
  for(const [legacyCustomerId,targetCustomerId] of mappings){
    const target=database.prepare('SELECT id,jodoo_customer_id,name FROM customers WHERE jodoo_customer_id=?').get(targetCustomerId)
    if(!target){conflicts.push({legacyCustomerId,targetCustomerId,reason:'TARGET_CUSTOMER_NOT_FOUND'});continue}
    for(const branch of database.prepare(`SELECT id,jodoo_branch_id branchId,branch_name branchName,customer_id customerId,source_customer_id sourceCustomerId
      FROM branches WHERE source_customer_id=?`).all(legacyCustomerId)){
      if(branch.customerId!=null&&branch.customerId!==target.id){
        conflicts.push({legacyCustomerId,targetCustomerId,branchId:branch.branchId,reason:'BRANCH_LINKED_TO_DIFFERENT_CUSTOMER'})
        continue
      }
      rows.push({...branch,legacyCustomerId,targetCustomerId,targetCustomerInternalId:target.id,targetCustomerName:target.name,requiresUpdate:branch.customerId!==target.id})
    }
  }
  return{rows,conflicts}
}

export function runMaterialConversion(database,{occPlan=[],nonOccAssignments=[],customerMappings=[],apply=false,actor='Material conversion v22'}={}){
  validate(database)
  const runId=crypto.randomUUID()
  const mappings=customerMappingMap(customerMappings),customerLinks=resolveCustomerLinks(database,mappings)
  const before={
    occAssignments:tableCount(database,'branch_occ_price_assignments'),
    customerProductPricing:tableCount(database,'customer_product_pricing'),
    branchAvailability:tableCount(database,'branch_product_availability'),
    historical:Object.fromEntries(historicalTables.map(table=>[table,tableCount(database,table)])),
  }
  const occRows=occPlan.filter(row=>row.selectedPrice!=null&&!['TESTING_EXCLUDED','MANUAL_REQUIRED'].includes(row.category))
    .map(row=>{
      const branch=database.prepare('SELECT id FROM branches WHERE jodoo_branch_id=?').get(String(row.branchId))
      if(!branch)throw new Error(`Branch not found: ${row.branchId}`)
      return{branchId:branch.id,externalBranchId:String(row.branchId),price:Number(row.selectedPrice),groupId:uniqueOccGroup(database,row.selectedPrice)}
    })
  const nonOccResolution=resolvedNonOcc(nonOccAssignments,database,mappings),nonOccRows=nonOccResolution.rows
  const blockingConflicts=[...customerLinks.conflicts,...nonOccResolution.conflicts]
  if(apply&&blockingConflicts.length)throw new Error(`Conversion blocked by ${blockingConflicts.length} unresolved mapping conflict(s)`)
  const changes={customerLinks:0,occ:0,nonOcc:0,availability:0,legacyAudits:0,audit:0}
  if(apply){
    database.exec('BEGIN IMMEDIATE')
    try{
      for(const row of customerLinks.rows){
        if(!row.requiresUpdate)continue
        database.prepare('UPDATE branches SET customer_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(row.targetCustomerInternalId,row.id)
        database.prepare(`INSERT INTO material_conversion_audit(run_id,action,entity_type,entity_id,before_json,after_json,changed_by)
          VALUES(?,'link','branch_customer',?,?,?,?)`).run(runId,String(row.branchId),JSON.stringify({customerId:row.customerId,sourceCustomerId:row.sourceCustomerId}),JSON.stringify({customerId:row.targetCustomerInternalId,targetCustomerId:row.targetCustomerId,legacyCustomerId:row.legacyCustomerId}),actor)
        changes.customerLinks+=1;changes.audit+=1
      }
      for(const source of nonOccResolution.auditSources){
        const inserted=database.prepare(`INSERT OR IGNORE INTO material_conversion_audit(run_id,action,entity_type,entity_id,before_json,after_json,changed_by)
          VALUES(?,'preserve','legacy_item_assignment',?,NULL,?,?)`).run(runId,source.sourceRowId,JSON.stringify(source),actor)
        if(Number(inserted.changes)){changes.legacyAudits+=1;changes.audit+=1}
      }
      for(const row of occRows){
        const old=database.prepare('SELECT occ_price_group_id id FROM branch_occ_price_assignments WHERE branch_id=?').get(row.branchId)
        if(old?.id===row.groupId)continue
        database.prepare(`INSERT INTO branch_occ_price_assignments(branch_id,occ_price_group_id,assigned_by)
          VALUES(?,?,?) ON CONFLICT(branch_id) DO UPDATE SET occ_price_group_id=excluded.occ_price_group_id,assigned_by=excluded.assigned_by,updated_at=CURRENT_TIMESTAMP`).run(row.branchId,row.groupId,actor)
        database.prepare(`INSERT INTO branch_occ_price_assignment_history(branch_id,old_occ_price_group_id,new_occ_price_group_id,reason,changed_by)
          VALUES(?,?,?,'Approved v22 OCC conversion',?)`).run(row.branchId,old?.id||null,row.groupId,actor)
        changes.occ+=1
      }
      for(const row of nonOccRows){
        const old=database.prepare('SELECT * FROM customer_product_pricing WHERE customer_id=? AND product_id=?').get(row.customerId,row.productId)
        if(old?.standard_price_level_id===row.priceLevelId&&old.status==='active')continue
        database.prepare(`INSERT INTO customer_product_pricing(customer_id,product_id,standard_price_level_id,outstation_enabled,outstation_price_level_id,status,legacy_source_json,updated_by)
          VALUES(?,?,?,0,NULL,'active',?,?)
          ON CONFLICT(customer_id,product_id) DO UPDATE SET standard_price_level_id=excluded.standard_price_level_id,status='active',legacy_source_json=excluded.legacy_source_json,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
          .run(row.customerId,row.productId,row.priceLevelId,JSON.stringify({legacyCustomerId:row.legacyCustomerId,targetCustomerId:row.externalCustomerId,legacyItemId:row.legacyItemId,legacyName:row.legacyName,sources:row.sources}),actor)
        database.prepare(`INSERT INTO material_conversion_audit(run_id,action,entity_type,entity_id,before_json,after_json,changed_by)
          VALUES(?,'upsert','customer_product_pricing',?,?,?,?)`).run(runId,`${row.customerId}:${row.productId}`,old?JSON.stringify(old):null,JSON.stringify(row),actor)
        changes.nonOcc+=1;changes.audit+=1
        const availabilityBefore=database.prepare(`SELECT COUNT(*) count FROM branch_product_availability a
          JOIN branches b ON b.id=a.branch_id WHERE b.customer_id=? AND a.product_id=?`).get(row.customerId,row.productId).count
        database.prepare(`INSERT OR IGNORE INTO branch_product_availability(branch_id,product_id,is_selectable,created_by)
          SELECT id,?,1,? FROM branches WHERE customer_id=?`).run(row.productId,actor,row.customerId)
        const availabilityAfter=database.prepare(`SELECT COUNT(*) count FROM branch_product_availability a
          JOIN branches b ON b.id=a.branch_id WHERE b.customer_id=? AND a.product_id=?`).get(row.customerId,row.productId).count
        changes.availability+=availabilityAfter-availabilityBefore
      }
      database.exec('COMMIT')
    }catch(error){database.exec('ROLLBACK');throw error}
  }
  const after={
    occAssignments:tableCount(database,'branch_occ_price_assignments'),
    customerProductPricing:tableCount(database,'customer_product_pricing'),
    branchAvailability:tableCount(database,'branch_product_availability'),
    historical:Object.fromEntries(historicalTables.map(table=>[table,tableCount(database,table)])),
  }
  const historicalModified=historicalTables.reduce((sum,table)=>sum+Math.abs(after.historical[table]-before.historical[table]),0)
  if(historicalModified)throw new Error('Historical records changed during conversion')
  return{
    runId,mode:apply?'APPLY':'DRY_RUN',occPreviewCount:occRows.length,nonOccLegacyRows:nonOccAssignments.filter(row=>row.customerId&&row.legacyItemId).length,
    nonOccCurrentConnections:nonOccRows.length,nonOccConflicts:nonOccResolution.conflicts,
    nonOccReconciliation:{
      legacySources:nonOccResolution.auditSources.length,
      uniqueConnections:nonOccRows.length,
      merges:nonOccRows.filter(row=>row.sources.length>1).map(row=>({
        targetCustomerId:row.externalCustomerId,
        productCode:row.productCode,
        legacySourceCount:row.sources.length,
        reduction:row.sources.length-1,
        sources:row.sources,
      })),
    },
    customerMappingPlan:customerLinks.rows.map(row=>({legacyCustomerId:row.legacyCustomerId,targetCustomerId:row.targetCustomerId,branchId:row.branchId,requiresUpdate:row.requiresUpdate})),
    customerMappingConflicts:customerLinks.conflicts,changes,before,after,historicalModified,
    databaseWrites:apply?changes.customerLinks+changes.occ+changes.nonOcc+changes.availability+changes.audit:0,
  }
}
