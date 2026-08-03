import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const ACTOR='kcadmin'
const nowReason={
  bs:'No Current Business — Deferred by Supervisor',
  wrong:'Wrong Spelling Duplicate — Supervisor Approved',
  area:'Area Name, Not a Customer — Supervisor Approved',
  duplicate:'Duplicate Branch — Supervisor Approved',
  created:'Customer/Branch Master Repair — Supervisor Approved',
}
const paused=[
  ['10019','BS BAU',null,'10015',nowReason.bs],['10021','BS DEPO',null,'10015',nowReason.bs],['10020','BS BT7',null,'10015',nowReason.bs],['10023','BS SATOK',null,'10015',nowReason.bs],['10024','BS TAPAH',null,'10015',nowReason.bs],
  ['10007','AM STEEL','10004',null,nowReason.wrong],['10364','Samariang','10184',null,nowReason.area],
  ['10354','EMC BATU 2','10176',null,nowReason.duplicate],['10421','WATSON LUNDU','10172',null,nowReason.duplicate],['10477','CHURCH STUTONG','10213',null,nowReason.duplicate],['10445','KINDERGARTEN KUCHING','10238',null,nowReason.duplicate],['10366','PULLMAN','10185',null,nowReason.duplicate],
]
const retained=[['10004','ASTEEL'],['10039','DIY'],['10271','MIXUE']]
const retainedBranches=[['10353','EMC BATU 2'],['10416','WATSON LUNDU'],['10402','CHURCH STUTONG'],['10444','KINDERGARTEN KUCHING'],['10365','PULLMAN'],['10427','ASTEEL DEMAK']]
const newCustomers=['HARI-HARI','RA MART','LIAN KEE']
const newBranches=[['DIY WFP','10039'],['MIXUE MATANG','10271'],['HARI-HARI MTG','HARI-HARI'],['RA MART MALIHA','RA MART'],['LIAN KEE BAU','LIAN KEE']]
const j=v=>v==null?null:JSON.stringify(v)
const extNum=v=>/^\d+$/.test(String(v||''))?Number(v):null
const nextCodes=(rows,count)=>{const used=new Set(rows.map(x=>String(x.code))),nums=rows.map(x=>extNum(x.code)).filter(Number.isFinite);let n=Math.max(...nums,0)+1,out=[];while(out.length<count){const s=String(n++);if(!used.has(s)){used.add(s);out.push(s)}}return out}
const counts=db=>({customers:db.prepare('SELECT COUNT(*) n FROM customers').get().n,branches:db.prepare('SELECT COUNT(*) n FROM branches').get().n,customersActive:db.prepare('SELECT COUNT(*) n FROM customers WHERE is_active=1').get().n,customersInactive:db.prepare('SELECT COUNT(*) n FROM customers WHERE is_active=0').get().n,branchesActive:db.prepare('SELECT COUNT(*) n FROM branches WHERE is_active=1').get().n,branchesInactive:db.prepare('SELECT COUNT(*) n FROM branches WHERE is_active=0').get().n,audit:db.prepare('SELECT COUNT(*) n FROM master_change_history').get().n,occAssignments:db.prepare('SELECT COUNT(*) n FROM branch_occ_price_assignments').get().n,schedules:db.prepare('SELECT COUNT(*) n FROM branch_schedules').get().n,weekdays:db.prepare("SELECT COUNT(*) n FROM branches WHERE assigned_weekdays IS NOT NULL AND TRIM(assigned_weekdays)<>''").get().n,frequency:db.prepare("SELECT COUNT(*) n FROM branches WHERE collection_frequency IS NOT NULL AND TRIM(collection_frequency)<>''").get().n,baseAvailability:db.prepare('SELECT COUNT(*) n FROM branch_product_availability').get().n})
const branchRow=(db,id)=>db.prepare(`SELECT b.*,c.jodoo_customer_id customer_code,c.name customer_name FROM branches b LEFT JOIN customers c ON c.id=b.customer_id WHERE b.jodoo_branch_id=?`).get(id)
const customerRow=(db,id)=>db.prepare('SELECT * FROM customers WHERE jodoo_customer_id=?').get(id)
function audit(db,type,id,change,before,after,reason){db.prepare(`INSERT INTO master_change_history(entity_type,entity_id,change_type,before_json,after_json,reason,changed_by) VALUES(?,?,?,?,?,?,?)`).run(type,String(id),change,j(before),j(after),reason,ACTOR)}
function appendNote(existing,reason){const v=String(existing||'').trim();return v.includes(reason)?v:[v,reason].filter(Boolean).join(' | ')}

export function runCustomerBranchRepair(db,{apply=false}={}){
  db.exec('PRAGMA foreign_keys=ON')
  const schema=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
  if(schema!==25)throw new Error(`Expected Schema v25, found v${schema}`)
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Pre-write integrity_check failed')
  const before=counts(db),plan={schema,paused:[],createdCustomers:[],createdBranches:[],skipped:[],customerCodes:{},branchCodes:{}},customerRows=db.prepare('SELECT jodoo_customer_id code FROM customers').all(),branchRows=db.prepare('SELECT jodoo_branch_id code FROM branches').all()
  for(const [id,name] of retained){const c=customerRow(db,id);if(!c||c.name!==name||c.status!=='active'||Number(c.is_active)!==1)throw new Error(`Retained Customer mismatch: ${id} ${name}`)}
  for(const [id,name] of retainedBranches){const b=branchRow(db,id);if(!b||b.branch_name!==name||b.status!=='active'||Number(b.is_active)!==1)throw new Error(`Retained Branch mismatch: ${id} ${name}`)}
  if(customerRow(db,'10015'))throw new Error('BS Customer 10015 unexpectedly exists; stop for review')
  for(const [id,name,customerCode,sourceCode,reason] of paused){const b=branchRow(db,id);if(!b||b.branch_name!==name)throw new Error(`Branch mismatch: ${id} ${name}`);if(sourceCode!==null&&String(b.source_customer_id)!==sourceCode)throw new Error(`source_customer_id mismatch for ${id}`);const alreadyUnlinked=id==='10364'&&b.customer_id==null&&b.status==='paused'&&Number(b.is_active)===0;if(customerCode!==null&&String(b.customer_code)!==customerCode&&!alreadyUnlinked)throw new Error(`Customer link mismatch for ${id}`);plan.paused.push({branchId:id,name,beforeStatus:b.status,afterStatus:'paused',reason,unlinkCustomer:id==='10364'})}
  const customerCodes=nextCodes(customerRows,newCustomers.length);newCustomers.forEach((name,i)=>plan.customerCodes[name]=customerCodes[i])
  const branchCodes=nextCodes(branchRows,newBranches.length);newBranches.forEach(([name],i)=>plan.branchCodes[name]=branchCodes[i])
  for(const name of newCustomers){const existing=db.prepare('SELECT * FROM customers WHERE UPPER(TRIM(name))=UPPER(?)').all(name);if(existing.length){if(existing.length!==1)throw new Error(`Duplicate Customer name exists: ${name}`);plan.customerCodes[name]=String(existing[0].jodoo_customer_id);plan.skipped.push(`Customer ${name} already exists as ${plan.customerCodes[name]}`)}}
  for(const [name,target] of newBranches){const existing=db.prepare('SELECT * FROM branches WHERE UPPER(TRIM(branch_name))=UPPER(?)').all(name);if(existing.length){if(existing.length!==1)throw new Error(`Duplicate Branch name exists: ${name}`);const targetCode=/^\d+$/.test(target)?target:plan.customerCodes[target],linked=branchRow(db,existing[0].jodoo_branch_id);if(String(linked.customer_code)!==String(targetCode))throw new Error(`Existing Branch ${name} belongs to unexpected Customer`);plan.branchCodes[name]=String(existing[0].jodoo_branch_id);plan.skipped.push(`Branch ${name} already exists as ${plan.branchCodes[name]}`)}}
  if(!apply)return{mode:'dry-run',before,plan,writes:0}
  const write={customersCreated:0,branchesCreated:0,branchesPaused:0,branchesUnlinked:0,auditInserted:0,baseAvailabilityCreated:0}
  db.exec('BEGIN IMMEDIATE')
  try{
    for(const [id,_name,_customerCode,_sourceCode,reason] of paused){const b=branchRow(db,id),notes=appendNote(b.notes,reason),shouldUnlink=id==='10364';if(b.status==='paused'&&Number(b.is_active)===0&&(!shouldUnlink||b.customer_id==null)&&b.notes===notes)continue;const beforeRow={...b};db.prepare('UPDATE branches SET customer_id=CASE WHEN ? THEN NULL ELSE customer_id END,status=?,is_active=0,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(shouldUnlink?1:0,'paused',notes,b.id);const after=branchRow(db,id);audit(db,'branch',id,'supervisor_master_repair',beforeRow,after,reason);write.branchesPaused++;if(shouldUnlink&&b.customer_id!=null)write.branchesUnlinked++;write.auditInserted++}
    for(const name of newCustomers){if(db.prepare('SELECT 1 FROM customers WHERE UPPER(TRIM(name))=UPPER(?)').get(name))continue;const code=plan.customerCodes[name];db.prepare(`INSERT INTO customers(jodoo_customer_id,name,status,notes,source_system,created_by,created_at,is_active) VALUES(?,?,'active',?,'KCS',?,CURRENT_TIMESTAMP,1)`).run(code,name,nowReason.created,ACTOR);const after=customerRow(db,code);audit(db,'customer',code,'created',null,after,nowReason.created);write.customersCreated++;write.auditInserted++}
    for(const [name,target] of newBranches){if(db.prepare('SELECT 1 FROM branches WHERE UPPER(TRIM(branch_name))=UPPER(?)').get(name))continue;const customerCode=/^\d+$/.test(target)?target:plan.customerCodes[target],customer=customerRow(db,customerCode);if(!customer||customer.status!=='active')throw new Error(`Target Customer unavailable for ${name}`);const code=plan.branchCodes[name],availBefore=counts(db).baseAvailability;db.prepare(`INSERT INTO branches(jodoo_branch_id,customer_id,source_customer_id,branch_name,status,notes,source_system,created_by,created_at,is_active,collection_frequency,assigned_weekdays,occ_price) VALUES(?,?,?,?,?,?, 'KCS',?,CURRENT_TIMESTAMP,1,NULL,NULL,NULL)`).run(code,customer.id,customerCode,name,'active',nowReason.created,ACTOR);const after=branchRow(db,code);audit(db,'branch',code,'created',null,after,nowReason.created);write.branchesCreated++;write.auditInserted++;write.baseAvailabilityCreated+=counts(db).baseAvailability-availBefore}
    for(const [id,name] of retained){const c=customerRow(db,id);if(c.name!==name||c.status!=='active'||Number(c.is_active)!==1)throw new Error(`Retained Customer changed: ${id}`)}
    for(const [id,name] of retainedBranches){const b=branchRow(db,id);if(b.branch_name!==name||b.status!=='active'||Number(b.is_active)!==1)throw new Error(`Retained Branch changed: ${id}`)}
    for(const [id] of paused){const b=branchRow(db,id);if(b.status!=='paused'||Number(b.is_active)!==0)throw new Error(`Branch was not paused: ${id}`)}
    if(customerRow(db,'10015'))throw new Error('BS Customer was created unexpectedly')
    const after=counts(db);if(after.occAssignments!==before.occAssignments||after.schedules!==before.schedules||after.weekdays!==before.weekdays||after.frequency!==before.frequency)throw new Error('Forbidden OCC/Frequency/Weekday/Schedule change detected')
    const fk=db.prepare('PRAGMA foreign_key_check').all();if(fk.length)throw new Error(`foreign_key_check failed: ${fk.length}`)
    if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Post-write integrity_check failed')
    db.exec('COMMIT');return{mode:'apply',before,after,plan,write,writes:Object.values(write).reduce((a,b)=>a+b,0)}
  }catch(error){db.exec('ROLLBACK');throw error}
}

function main(){const args=process.argv.slice(2),apply=args.includes('--apply'),dbArg=args.find(x=>x.startsWith('--db='))?.slice(5)||process.env.KCS_DB_PATH,logArg=args.find(x=>x.startsWith('--log='))?.slice(6);if(!dbArg)throw new Error('Use --db=<absolute sqlite path> or KCS_DB_PATH');const dbPath=path.resolve(dbArg);if(!fs.existsSync(dbPath))throw new Error(`Database not found: ${dbPath}`);const db=new DatabaseSync(dbPath,{readOnly:!apply});try{const result=runCustomerBranchRepair(db,{apply});const output=JSON.stringify({...result,databasePath:dbPath,actor:ACTOR,completedAt:new Date().toISOString()},null,2);if(logArg)fs.writeFileSync(path.resolve(logArg),output);console.log(output)}finally{db.close()}}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main()
