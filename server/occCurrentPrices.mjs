import {chmodSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {kuchingDate} from '../shared/kuchingTime.js'

const hasTable=(db,name)=>Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode})}
// Retain every level ID and reference. Prices are values, not group identities.
export function ensureOccCurrentPrices(db){
 const sql=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='material_price_levels'").get()?.sql
 const constraint=/,\s*UNIQUE\s*\(\s*material_id\s*,\s*price_amount\s*,\s*effective_date\s*\)/i
 if(sql&&constraint.test(sql)){
  const filename=db.prepare('PRAGMA database_list').all().find(row=>row.name==='main')?.file
  if(filename){const backup=filename+'.before-occ-groups-'+Date.now()+'.db';db.prepare('VACUUM INTO ?').run(backup);chmodSync(backup,0o600)}
  const indexes=db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name='material_price_levels' AND type IN ('index','trigger') AND sql IS NOT NULL").all()
  const columns=db.prepare('PRAGMA table_info(material_price_levels)').all().map(x=>`"${x.name}"`).join(',')
  const foreignKeys=db.prepare('PRAGMA foreign_keys').get().foreign_keys,legacy=db.prepare('PRAGMA legacy_alter_table').get().legacy_alter_table
  db.exec('PRAGMA foreign_keys=OFF; PRAGMA legacy_alter_table=ON; BEGIN IMMEDIATE')
  try{
   db.exec(sql.replace(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["`]?material_price_levels["`]?/i,'CREATE TABLE occ_levels_rebuild').replace(constraint,''))
   db.exec(`INSERT INTO occ_levels_rebuild(${columns}) SELECT ${columns} FROM material_price_levels; DROP TABLE material_price_levels; ALTER TABLE occ_levels_rebuild RENAME TO material_price_levels;`)
   for(const row of indexes)db.exec(row.sql)
   if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('OCC price schema foreign key check failed')
   db.exec('COMMIT')
  }catch(e){db.exec('ROLLBACK');throw e}finally{db.exec(`PRAGMA foreign_keys=${foreignKeys}; PRAGMA legacy_alter_table=${legacy}`)}
 }
 // Preserve the previous non-OCC uniqueness rule after rebuilding the shared table.
 db.exec(`CREATE TRIGGER IF NOT EXISTS material_level_unique_non_occ_insert BEFORE INSERT ON material_price_levels
 WHEN EXISTS(SELECT 1 FROM materials WHERE id=NEW.material_id AND material_code<>'OCC') AND EXISTS(SELECT 1 FROM material_price_levels WHERE material_id=NEW.material_id AND price_amount=NEW.price_amount AND effective_date=NEW.effective_date)
 BEGIN SELECT RAISE(ABORT,'Duplicate material price level'); END;
 CREATE TRIGGER IF NOT EXISTS material_level_unique_non_occ_update BEFORE UPDATE OF material_id,price_amount,effective_date ON material_price_levels
 WHEN EXISTS(SELECT 1 FROM materials WHERE id=NEW.material_id AND material_code<>'OCC') AND EXISTS(SELECT 1 FROM material_price_levels WHERE id<>NEW.id AND material_id=NEW.material_id AND price_amount=NEW.price_amount AND effective_date=NEW.effective_date)
 BEGIN SELECT RAISE(ABORT,'Duplicate material price level'); END;`)
 // Only OCC permits separate groups at the same price. Other fixed products retain their index.
 db.exec("UPDATE material_price_levels SET is_fixed=0 WHERE material_id IN (SELECT id FROM materials WHERE material_code='OCC') AND is_fixed<>0")
 db.exec(`CREATE TABLE IF NOT EXISTS occ_current_price_changes(
  id INTEGER PRIMARY KEY,price_level_id INTEGER NOT NULL REFERENCES material_price_levels(id),old_price REAL NOT NULL,new_price REAL NOT NULL,
  effective_date TEXT NOT NULL,reason TEXT NOT NULL,changed_by TEXT NOT NULL,preview_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','applied','cancelled')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,applied_at TEXT
 ); CREATE UNIQUE INDEX IF NOT EXISTS occ_one_pending_price ON occ_current_price_changes(price_level_id) WHERE state='pending';`)
}
export function assertNoPendingOccPrice(db,id){
 if(hasTable(db,'occ_current_price_changes')&&db.prepare("SELECT 1 FROM occ_current_price_changes WHERE price_level_id=? AND state='pending'").get(id))fail('This group already has a scheduled price change.',409)
}
export function applyDueOccPrices(db,today=kuchingDate()){
 if(!hasTable(db,'occ_current_price_changes'))return
 const due=db.prepare("SELECT * FROM occ_current_price_changes WHERE state='pending' AND effective_date<=? ORDER BY effective_date,id").all(today)
 if(!due.length)return
 db.exec('SAVEPOINT apply_occ_prices')
 try{for(const change of due){
  const level=db.prepare('SELECT * FROM material_price_levels WHERE id=?').get(change.price_level_id)
  // Another editor wins: never silently overwrite a newer direct price change.
  if(!level||Number(level.price_amount)!==Number(change.old_price)){db.prepare("UPDATE occ_current_price_changes SET state='cancelled' WHERE id=?").run(change.id);continue}
  db.prepare('UPDATE material_price_levels SET previous_price_amount=price_amount,price_amount=?,price_cents=?,is_fixed=0,effective_date=?,reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(change.new_price,Math.round(change.new_price*100),change.effective_date,change.reason,level.id)
  db.prepare("UPDATE occ_current_price_changes SET state='applied',applied_at=CURRENT_TIMESTAMP WHERE id=?").run(change.id)
 }db.exec('RELEASE apply_occ_prices')}catch(e){db.exec('ROLLBACK TO apply_occ_prices; RELEASE apply_occ_prices');throw e}
}
const product=db=>db.prepare("SELECT p.* FROM material_products p JOIN materials m ON m.id=p.material_id WHERE p.product_code='OCC' AND m.material_code='OCC' AND p.status='active'").get()
function assignments(db,p){
 const rows=db.prepare(`SELECT cpp.id rowId,cpp.customer_id customerId,'product' source,'standard' priceType,cpp.standard_price_level_id levelId,NULL specialPrice FROM customer_product_pricing cpp WHERE cpp.product_id=? AND cpp.status='active'
 UNION ALL SELECT cpp.id,cpp.customer_id,'product','outstation',cpp.outstation_price_level_id,NULL FROM customer_product_pricing cpp WHERE cpp.product_id=? AND cpp.status='active' AND cpp.outstation_enabled=1
 UNION ALL SELECT cmp.id,cmp.customer_id,'material','standard',cmp.standard_price_level_id,cmp.standard_special_price FROM customer_material_pricing cmp WHERE cmp.material_id=? AND cmp.status='active' AND cmp.resolution_state='ready' AND NOT EXISTS(SELECT 1 FROM customer_product_pricing cpp WHERE cpp.customer_id=cmp.customer_id AND cpp.product_id=? AND cpp.status='active')
 UNION ALL SELECT cmp.id,cmp.customer_id,'material','outstation',cmp.outstation_price_level_id,cmp.outstation_special_price FROM customer_material_pricing cmp WHERE cmp.material_id=? AND cmp.status='active' AND cmp.resolution_state='ready' AND cmp.outstation_enabled=1 AND NOT EXISTS(SELECT 1 FROM customer_product_pricing cpp WHERE cpp.customer_id=cmp.customer_id AND cpp.product_id=? AND cpp.status='active')`).all(p.id,p.id,p.material_id,p.id,p.material_id,p.id)
 return rows.map(row=>{
  const c=db.prepare('SELECT jodoo_customer_id customerCode,name customerName,status FROM customers WHERE id=?').get(row.customerId)
  const branches=db.prepare('SELECT id,jodoo_branch_id branchCode,branch_name branchName FROM branches WHERE customer_id=? ORDER BY branch_name COLLATE NOCASE,id').all(row.customerId)
  return {...row,...c,branches,key:`${row.source}:${row.rowId}:${row.priceType}`}
 })
}
const signature=group=>createHash('sha256').update(JSON.stringify({id:group.id,price:group.price,date:group.date,status:group.status,visibility:group.visibility,pending:group.pending,members:group.members.map(m=>[m.key,m.levelId,m.specialPrice,m.branches.map(b=>b.id)])})).digest('hex')
export function currentOccGroups(db,today=kuchingDate()){
 applyDueOccPrices(db,today)
 const p=product(db);if(!p)return {groups:[],special:[],unpriced:[]}
 const refs=assignments(db,p)
 const groups=db.prepare("SELECT * FROM material_price_levels WHERE material_id=? AND (product_id=? OR product_id IS NULL) ORDER BY price_amount,id").all(p.material_id,p.id).map(l=>{
  const members=refs.filter(r=>r.specialPrice==null&&Number(r.levelId)===l.id)
  const pending=db.prepare("SELECT id,new_price price,effective_date date FROM occ_current_price_changes WHERE price_level_id=? AND state='pending'").get(l.id)||null
  const group={id:l.id,code:`OCC-${l.id}`,price:l.price_amount,date:l.effective_date,status:l.status,visibility:l.visibility_status,members,pending,customerCount:new Set(members.map(m=>m.customerId)).size,branchCount:new Set(members.flatMap(m=>m.branches.map(b=>b.id))).size}
  group.version=signature(group);return group
 })
 const special=refs.filter(r=>r.specialPrice!=null),configured=new Set(refs.map(r=>r.customerId))
 const unpriced=db.prepare("SELECT id customerId,jodoo_customer_id customerCode,name customerName FROM customers WHERE status='active' ORDER BY name COLLATE NOCASE").all().filter(c=>!configured.has(c.customerId))
 return {groups,special,unpriced,productId:p.id}
}
export function changeCurrentOccPrice(db,id,payload,today=kuchingDate()){
 applyDueOccPrices(db,today)
 db.exec('SAVEPOINT change_occ_price')
 try{
 const group=currentOccGroups(db,today).groups.find(g=>g.id===Number(id))
 if(!group)fail('OCC price group not found.',404)
 if(group.version!==payload.version)fail('Price or customers changed. Refresh and review again.',409)
 if(group.status!=='active'||group.visibility!=='active')fail('This price group is inactive.')
 if(group.pending)fail('This group already has a scheduled price change.',409)
 const price=Number(payload.price),date=String(payload.effectiveDate||''),reason=String(payload.reason||'').trim()
 if(!String(payload.price??'').trim()||!Number.isFinite(price)||price<=0||Math.abs(price*1000-Math.round(price*1000))>0.000001)fail('Enter a price greater than zero with at most 3 decimals.')
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<today)fail('Choose today or a future effective date.')
 if(!reason)fail('Enter a reason.')
 if(price===Number(group.price))fail('Enter a different price.')
 db.prepare("INSERT INTO occ_current_price_changes(price_level_id,old_price,new_price,effective_date,reason,changed_by,preview_json,state) VALUES(?,?,?,?,?,?,?,'pending')").run(group.id,group.price,price,date,reason,payload.changedBy||'Administrator',JSON.stringify(group))
 applyDueOccPrices(db,today)
 db.exec('RELEASE change_occ_price');return {ok:true}
 }catch(e){db.exec('ROLLBACK TO change_occ_price; RELEASE change_occ_price');throw e}
}
export function moveCurrentOccCustomers(db,payload,today=kuchingDate()){
 applyDueOccPrices(db,today)
 db.exec('SAVEPOINT move_occ_customers')
 try{
 const data=currentOccGroups(db,today),source=data.groups.find(g=>g.id===Number(payload.sourceId)),target=data.groups.find(g=>g.id===Number(payload.targetId))
 if(!source||!target||source.id===target.id)fail('Select a different OCC price group.')
 if(source.version!==payload.sourceVersion||target.version!==payload.targetVersion)fail('Price or customers changed. Refresh and review again.',409)
 if(target.status!=='active'||target.visibility!=='active')fail('Target price group is inactive.')
 const reason=String(payload.reason||'').trim(),keys=[...new Set(payload.keys||[])];if(!reason||!keys.length)fail('Select customers and enter a reason.')
 const p=product(db),targetLevel=db.prepare('SELECT product_id FROM material_price_levels WHERE id=?').get(target.id)
 if(targetLevel.product_id==null)db.prepare('UPDATE material_price_levels SET product_id=? WHERE id=?').run(p.id,target.id)
 for(const key of keys){
  const member=source.members.find(m=>m.key===key);if(!member)fail('Customer assignment changed. Refresh and review again.',409)
  const table=member.source==='product'?'customer_product_pricing':'customer_material_pricing',column=member.priceType==='standard'?'standard_price_level_id':'outstation_price_level_id'
  const before=db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(member.rowId)
  db.prepare(`UPDATE ${table} SET ${column}=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(target.id,payload.changedBy||'Administrator',member.rowId)
  const after=db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(member.rowId)
  db.prepare("INSERT INTO material_conversion_audit(run_id,action,entity_type,entity_id,before_json,after_json,changed_by) VALUES(?,'move_price_group',?,?,?,?,?)").run(`occ-current-${Date.now()}`,table,String(member.rowId),JSON.stringify(before),JSON.stringify({...after,reason}),payload.changedBy||'Administrator')
 }
 db.exec('RELEASE move_occ_customers');return {ok:true,changedCount:keys.length}
 }catch(e){db.exec('ROLLBACK TO move_occ_customers; RELEASE move_occ_customers');throw e}
}

// Explicit, previewed normalization of effective OCC special prices. Never infer
// assignments from legacy branch archives or silently choose among equal groups.
export function previewOccPriceGrouping(db,today=kuchingDate()){
 const data=currentOccGroups(db,today),p=product(db),buckets=new Map(),blocked=[]
 for(const member of data.special){
  const price=Number(member.specialPrice)
  if(!Number.isFinite(price)||price<=0||Math.abs(price*1000-Math.round(price*1000))>0.000001){blocked.push(member);continue}
  const key=String(price)
  if(!buckets.has(key)){
   const options=data.groups.filter(g=>g.status==='active'&&g.visibility==='active'&&!g.pending&&g.date<=today&&Number(g.price)===price).map(g=>({id:g.id,code:g.code,price:g.price,version:g.version,customerCount:g.customerCount}))
   buckets.set(key,{key,price,options,defaultTarget:options.length===1?String(options[0].id):options.length===0?'new':'',members:[]})
  }
  buckets.get(key).members.push(member)
 }
 const items=[...buckets.values()].sort((a,b)=>a.price-b.price)
 const rows=p?db.prepare("SELECT * FROM customer_material_pricing WHERE material_id=? ORDER BY id").all(p.material_id):[]
 const version=createHash('sha256').update(JSON.stringify({today,items,blocked,rows})).digest('hex')
 return {version,items,blocked,recordCount:items.reduce((n,g)=>n+g.members.length,0),customerCount:new Set(items.flatMap(g=>g.members.map(m=>m.customerId))).size}
}
export function groupOccSpecialPrices(db,payload,today=kuchingDate()){
 applyDueOccPrices(db,today)
 db.exec('SAVEPOINT group_occ_special_prices')
 try{
  const plan=previewOccPriceGrouping(db,today)
  if(!payload.version||payload.version!==plan.version)fail('Price or customers changed. Refresh and review again.',409)
  const p=product(db),actor=String(payload.changedBy||'Administrator'),reason='Group OCC special prices at unchanged current prices',runId=`occ-same-price-${Date.now()}`
  const choices=payload.choices||{},targets=new Map()
  for(const bucket of plan.items){
   const target=String(choices[bucket.key]??bucket.defaultTarget)
   if(target==='new'&&bucket.options.length===0){targets.set(bucket.key,null);continue}
   const match=bucket.options.find(g=>String(g.id)===target)
   if(!match)fail('Select a matching group for every price.')
   targets.set(bucket.key,match.id)
  }
  let changedCount=0,createdGroups=0
  for(const bucket of plan.items){
   let targetId=targets.get(bucket.key)
   if(!targetId){
    targetId=Number(db.prepare(`INSERT INTO material_price_levels(material_id,product_id,price_amount,price_cents,is_fixed,effective_date,status,reason,created_by,visibility_status) VALUES(?,?,?,?,0,?,'active',?,?,'active')`).run(p.material_id,p.id,bucket.price,Math.round(bucket.price*100),today,reason,actor).lastInsertRowid)
    db.prepare("INSERT INTO material_master_audit(entity_type,entity_id,action,after_json,reason,changed_by) VALUES('priceGroup',?,'create',?,?,?)").run(targetId,JSON.stringify({productId:p.id,price:bucket.price,runId}),reason,actor);createdGroups++
   }
   // Compatible fallback levels become available in the shared product selector too.
   db.prepare('UPDATE material_price_levels SET product_id=? WHERE id=? AND product_id IS NULL').run(p.id,targetId)
   for(const member of bucket.members){
    const row=db.prepare('SELECT * FROM customer_material_pricing WHERE id=?').get(member.rowId)
    const prefix=member.priceType==='outstation'?'outstation':'standard'
    if(row[`${prefix}_special_price`]!==bucket.price)fail('Customer assignment changed. Refresh and review again.',409)
    db.prepare(`UPDATE customer_material_pricing SET ${prefix}_special_price=NULL,${prefix}_price_level_id=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(targetId,actor,row.id)
    const after=db.prepare('SELECT * FROM customer_material_pricing WHERE id=?').get(row.id)
    // The amount, selected price type, enable flags and dates are unchanged.
    const level=db.prepare('SELECT price_amount FROM material_price_levels WHERE id=?').get(targetId)
    if(Number(level.price_amount)!==Number(member.specialPrice)||row.price_type!==after.price_type||row.outstation_enabled!==after.outstation_enabled)fail('Price preservation check failed.',409)
    db.prepare(`INSERT INTO customer_material_pricing_history(customer_material_pricing_id,customer_id,material_id,before_json,after_json,affected_standard_branch_count,affected_outstation_branch_count,reason,changed_by) VALUES(?,?,?,?,?,?,?,?,?)`).run(row.id,row.customer_id,row.material_id,JSON.stringify(row),JSON.stringify(after),prefix==='standard'?member.branches.length:0,prefix==='outstation'?member.branches.length:0,reason,actor)
    db.prepare("INSERT INTO material_conversion_audit(run_id,action,entity_type,entity_id,before_json,after_json,changed_by) VALUES(?,'group_same_price','customer_material_pricing',?,?,?,?)").run(runId,`${row.id}:${prefix}`,JSON.stringify(row),JSON.stringify(after),actor)
    changedCount++
   }
  }
  db.exec('RELEASE group_occ_special_prices');return {ok:true,changedCount,createdGroups,customerCount:plan.customerCount,remaining:plan.blocked.length}
 }catch(e){db.exec('ROLLBACK TO group_occ_special_prices; RELEASE group_occ_special_prices');throw e}
}
