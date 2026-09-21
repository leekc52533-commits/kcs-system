import {DatabaseSync,backup} from 'node:sqlite'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {kuchingDate} from '../shared/kuchingTime.js'
const file=process.argv[2]
if(!file)throw Error('Database path required')
const target=resolve(file),apply=process.argv.includes('--apply')
// Imported services have a default database; isolate it from production completely.
const temporary=mkdtempSync(join(tmpdir(),'kcs-schedule-repair-'))
process.env.KCS_DATA_DIR=temporary
process.env.KCS_DB_PATH=join(temporary,'isolated.sqlite')
let db,defaultDb
try{
 const {syncSupervisorSavedSchedule}=await import('../server/dispatchService.mjs')
 defaultDb=(await import('../server/database.mjs')).db
 db=new DatabaseSync(target);db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=10000')
 if(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v!==77)throw Error('Schema 77 required')
 if(apply){const name=target+'.before-farley-schedule-sync-'+Date.now()+'.bak';await backup(db,name);console.log('BACKUP='+name)}
 db.exec('BEGIN IMMEDIATE')
 try{
 const results=[]
 for(const [code,name] of [['10147','FARLEY CAFE'],['10148','FARLEY GARDEN']]){
  const rows=db.prepare('SELECT * FROM branches WHERE UPPER(jodoo_branch_id) IN (?,?)').all(code,'B'+code)
  if(rows.length!==1||rows[0].branch_name.trim().toUpperCase()!==name)throw Error('Branch identity mismatch: '+code)
  const branch=rows[0],schedules=db.prepare('SELECT * FROM branch_schedules WHERE branch_id=? AND is_active=1').all(branch.id)
  if(schedules.length!==1)throw Error('Expected one active schedule: '+code)
  const schedule=schedules[0]
  if(!db.prepare("SELECT 1 FROM master_change_history WHERE entity_type='branch_schedule' AND entity_id=?").get(String(schedule.id)))throw Error('No recorded schedule edit: '+code)
  const before=db.prepare('SELECT * FROM dispatch_stops WHERE branch_id=? ORDER BY id').all(branch.id)
  const sync=syncSupervisorSavedSchedule({branchId:branch.id,scheduleId:schedule.id,startDate:kuchingDate(),changedBy:'KC confirmed schedule repair 2026-09-21'},db)
  const after=db.prepare('SELECT * FROM dispatch_stops WHERE branch_id=? ORDER BY id').all(branch.id)
  results.push({branch:'B'+code,name,weekdays:schedule.days_of_week,...sync,changedStops:after.filter(row=>JSON.stringify(row)!==JSON.stringify(before.find(old=>old.id===row.id))).map(row=>({id:row.id,date:row.service_date,status:row.status}))})
 }
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Foreign key check failed')
 db.exec(apply?'COMMIT':'ROLLBACK')
 console.log(JSON.stringify({mode:apply?'applied':'preview',startDate:kuchingDate(),results},null,2))
 }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error}
}finally{db?.close();defaultDb?.close();rmSync(temporary,{recursive:true,force:true})}
