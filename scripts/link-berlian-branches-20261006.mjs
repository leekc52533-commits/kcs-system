import {DatabaseSync,backup} from 'node:sqlite'
import {pathToFileURL} from 'node:url'
import {existsSync} from 'node:fs'

const reason='KC confirmed B10514 duplicates B10513 on 2026-10-06; retain B10513 and historical records'
function branch(db,code){
 const rows=db.prepare('SELECT * FROM branches WHERE UPPER(TRIM(jodoo_branch_id)) IN (?,?)').all(code,code.slice(1))
 if(rows.length!==1)throw Error(`Missing or ambiguous branch ${code}`)
 if(!/berlian/i.test(rows[0].branch_name)||!/wa(?:tson|ston)/i.test(rows[0].branch_name))throw Error(`Unexpected name for ${code}: ${rows[0].branch_name}`)
 return rows[0]
}
export function linkBerlianBranches(db,{apply=false}={}){
 db.exec('BEGIN IMMEDIATE')
 try{
  const source=branch(db,'B10514'),target=branch(db,'B10513')
  const customer=db.prepare('SELECT * FROM customers WHERE id=?').get(target.customer_id)
  if(target.is_active!==1||target.status!=='active'||target.lifecycle_status!=='ACTIVE'||target.replaced_by_branch_id||!customer||customer.is_active!==1||customer.status!=='active')throw Error('B10513 and its company must be active canonical records')
  if(source.replaced_by_branch_id&&source.replaced_by_branch_id!==target.id)throw Error('B10514 already links to another branch')
  const unfinished=db.prepare("SELECT id,status,service_date FROM dispatch_stops WHERE branch_id=? AND status NOT IN ('completed','cancelled')").all(source.id)
  if(unfinished.length)throw Error('B10514 has unfinished work; resolve it before linking: '+JSON.stringify(unfinished))
  const schedules=db.prepare('SELECT * FROM branch_schedules WHERE branch_id=?').all(source.id)
  const alreadyLinked=source.lifecycle_status==='DUPLICATE_REPLACED'&&source.replaced_by_branch_id===target.id&&source.is_active===0
  const result={mode:apply?'applied':'preview',keep:{code:'B10513',name:target.branch_name},duplicate:{code:'B10514',name:source.branch_name},alreadyLinked,
   retainedHistoricalBills:db.prepare('SELECT COUNT(*) n FROM purchase_bills WHERE branch_id=?').get(source.id).n,
   missingGps:target.latitude==null||target.longitude==null,missingArea:target.area_id==null,
   history:'Original bills, stops, payments and GPS stay under their original IDs; B10514 links to B10513. Company records are unchanged.'}
  if(!alreadyLinked||schedules.some(s=>s.is_active)){
   db.prepare("UPDATE branches SET lifecycle_status='DUPLICATE_REPLACED',replaced_by_branch_id=?,is_active=0,status='paused',status_reason=?,status_changed_by='KC',status_changed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(target.id,reason,source.id)
   db.prepare('UPDATE branch_schedules SET is_active=0 WHERE branch_id=?').run(source.id)
   db.prepare(`INSERT INTO master_change_history(entity_type,entity_id,change_type,field_name,old_value,new_value,before_json,after_json,reason,changed_by)
    VALUES('branch',?,'confirmed_duplicate_replaced','replaced_by_branch_id',?,?,?,?,?,'KC')`).run(source.jodoo_branch_id,source.replaced_by_branch_id==null?null:String(source.replaced_by_branch_id),target.jodoo_branch_id,JSON.stringify({branch:source,schedules}),JSON.stringify({canonicalBranch:target.jodoo_branch_id,lifecycle_status:'DUPLICATE_REPLACED'}),reason)
  }
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Foreign key check failed')
  db.exec(apply?'COMMIT':'ROLLBACK');return result
 }catch(error){db.exec('ROLLBACK');throw error}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const path=process.argv[2];if(!path||!existsSync(path))throw Error('Existing database path required')
 const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=10000')
 try{
  const apply=process.argv.includes('--apply')
  // Validate before creating a backup; revalidate under the write transaction.
  linkBerlianBranches(db)
  if(apply){const file=path+'.before-berlian-link-'+Date.now()+'.bak';await backup(db,file);console.log('BACKUP='+file)}
  console.log(JSON.stringify(linkBerlianBranches(db,{apply}),null,2))
 }finally{db.close()}
}
