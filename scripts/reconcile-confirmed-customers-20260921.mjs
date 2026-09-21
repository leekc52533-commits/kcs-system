import {DatabaseSync,backup} from 'node:sqlite'
import {pathToFileURL} from 'node:url'
export const branchMappings=[['B10507','B10500','C10039'],['B10503','B10500','C10039'],['B10508','B10107','C10041'],['B10509','B10165','C10056'],['B10506','B10495','C10272']]
export const customerMappings=[['C10279','C10039'],['C10283','C10039'],['C10284','C10041'],['C10285','C10056']]
const reason='KC confirmed duplicate identifiers on 2026-09-21; canonical master retained; historical documents unchanged'
function one(db,table,column,code){const raw=code.slice(1),rows=db.prepare(`SELECT * FROM ${table} WHERE UPPER(TRIM(${column})) IN (?,?)`).all(code,raw);if(rows.length!==1)throw Error(`Missing or ambiguous ${code}`);return rows[0]}
export function reconcile(db,{apply=false}={}){
 db.exec('BEGIN IMMEDIATE')
 try{
 const branches=branchMappings.map(([from,to,customer])=>{const source=one(db,'branches','jodoo_branch_id',from),target=one(db,'branches','jodoo_branch_id',to),parent=one(db,'customers','jodoo_customer_id',customer);if(target.customer_id!==parent.id||target.is_active!==1||target.lifecycle_status!=='ACTIVE'||parent.is_active!==1)throw Error(`Canonical branch/customer mismatch: ${to}/${customer}`);if(source.replaced_by_branch_id&&source.replaced_by_branch_id!==target.id)throw Error(`Conflicting replacement: ${from}`);return {from,to,source,target}})
 const customers=customerMappings.map(([from,to])=>({from,to,source:one(db,'customers','jodoo_customer_id',from),target:one(db,'customers','jodoo_customer_id',to)}))
 const ids=new Set(branches.map(b=>b.source.id))
 for(const c of customers){if(c.target.is_active!==1)throw Error(`Inactive canonical customer ${c.to}`);const unexpected=db.prepare("SELECT jodoo_branch_id,id FROM branches WHERE customer_id=? AND is_active=1").all(c.source.id).filter(b=>!ids.has(b.id));if(unexpected.length)throw Error(`${c.from} has other active branches: ${unexpected.map(b=>b.jodoo_branch_id).join(', ')}`)}
 const unfinished=branches.flatMap(b=>db.prepare("SELECT s.id,s.status,d.dispatch_date FROM dispatch_stops s JOIN dispatches d ON d.id=s.dispatch_id WHERE s.branch_id=? AND s.status NOT IN ('completed','cancelled')").all(b.source.id).map(s=>({...s,branch:b.from})))
 if(unfinished.length)throw Error('Unfinished stops require supervisor resolution before retiring duplicates: '+JSON.stringify(unfinished))
 const result={mode:apply?'applied':'preview',branches:[],customers:[],history:'Original bills, payments, collection records and GPS remain under original IDs; replaced_by_branch_id links to the retained branch.'}
 const audit=db.prepare('INSERT INTO master_change_history(entity_type,entity_id,change_type,field_name,old_value,new_value,before_json,after_json,reason,changed_by) VALUES(?,?,?,?,?,?,?,?,?,?)')
 for(const b of branches){const done=b.source.lifecycle_status==='DUPLICATE_REPLACED'&&b.source.replaced_by_branch_id===b.target.id&&!b.source.is_active
 if(!done){db.prepare("UPDATE branches SET lifecycle_status='DUPLICATE_REPLACED',replaced_by_branch_id=?,is_active=0,status='paused',status_reason=?,status_changed_by='KC confirmed repair',status_changed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(b.target.id,reason,b.source.id)
 const schedules=db.prepare('SELECT * FROM branch_schedules WHERE branch_id=?').all(b.source.id);db.prepare('UPDATE branch_schedules SET is_active=0 WHERE branch_id=?').run(b.source.id)
 audit.run('branch',b.source.jodoo_branch_id,'confirmed_duplicate_replaced','replaced_by_branch_id',null,b.target.jodoo_branch_id,JSON.stringify({branch:b.source,schedules}),JSON.stringify({canonicalBranch:b.target.jodoo_branch_id,lifecycle_status:'DUPLICATE_REPLACED',is_active:0}),reason,'KC')}
 result.branches.push({from:b.from,keep:b.to,alreadyLinked:done,bills:db.prepare('SELECT COUNT(*) n FROM purchase_bills WHERE branch_id=?').get(b.source.id).n})}
 for(const c of customers){const prior=db.prepare("SELECT new_value FROM master_change_history WHERE entity_type='customer' AND entity_id=? AND change_type='confirmed_duplicate_replaced' ORDER BY id DESC LIMIT 1").get(c.source.jodoo_customer_id);if(prior&&prior.new_value!==c.target.jodoo_customer_id)throw Error(`Conflicting customer replacement ${c.from}`)
 const done=!c.source.is_active&&prior?.new_value===c.target.jodoo_customer_id
 if(!done){db.prepare("UPDATE customers SET is_active=0,status='inactive',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(c.source.id);audit.run('customer',c.source.jodoo_customer_id,'confirmed_duplicate_replaced','canonical_customer',c.source.jodoo_customer_id,c.target.jodoo_customer_id,JSON.stringify(c.source),JSON.stringify({canonicalCustomer:c.target.jodoo_customer_id,is_active:0}),reason,'KC')}
 result.customers.push({from:c.from,keep:c.to,alreadyLinked:done})}
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Foreign key check failed')
 db.exec(apply?'COMMIT':'ROLLBACK');return result
 }catch(e){db.exec('ROLLBACK');throw e}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const path=process.argv[2];if(!path)throw Error('Database path required')
 const db=new DatabaseSync(path,{open:true});db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=10000')
 try{const apply=process.argv.includes('--apply');if(apply){const file=path+'.before-confirmed-customers-'+Date.now()+'.bak';await backup(db,file);console.log('BACKUP='+file)}console.log(JSON.stringify(reconcile(db,{apply}),null,2))}finally{db.close()}
}
