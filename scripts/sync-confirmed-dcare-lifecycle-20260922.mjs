import {DatabaseSync,backup} from 'node:sqlite'
import {mkdtempSync,rmSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {kuchingDate} from '../shared/kuchingTime.js'
const file=process.argv[2]
if(!file)throw Error('Database path required')
const target=resolve(file),apply=process.argv.includes('--apply')
if(!existsSync(target))throw Error('Database file does not exist')
// Imported services have a default database; isolate it from production completely.
const temporary=mkdtempSync(join(tmpdir(),'kcs-schedule-repair-'))
process.env.KCS_DATA_DIR=temporary
process.env.KCS_DB_PATH=join(temporary,'isolated.sqlite')
let db,defaultDb
try{
 const {syncInactiveBranchStops}=await import('../server/dispatchService.mjs')
 defaultDb=(await import('../server/database.mjs')).db
 db=new DatabaseSync(target);db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=10000')
 if(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v!==79)throw Error('Schema 79 required')
 if(apply){const name=target+'.before-dcare-lifecycle-sync-'+Date.now()+'.bak';await backup(db,name);console.log('BACKUP='+name)}
 db.exec('BEGIN IMMEDIATE')
 try{
 const results=[]
 for(const [code,name,status,stopId] of [['10049','DCARE','TEMPORARILY_PAUSED',4850],['10321','DCARE KLINIK','CLOSED',4871]]){
  const rows=db.prepare('SELECT * FROM branches WHERE UPPER(jodoo_branch_id) IN (?,?)').all(code,'B'+code)
  if(rows.length!==1||rows[0].branch_name.trim().toUpperCase()!==name||rows[0].lifecycle_status!==status)throw Error('Branch identity/status mismatch: '+code)
  const branch=rows[0],stop=db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(stopId)
  if(!stop||stop.branch_id!==branch.id||stop.service_date!=='2026-09-23')throw Error('Stop identity mismatch: '+stopId)
  const sync=syncInactiveBranchStops({branchId:branch.id,startDate:kuchingDate(),changedBy:'KC confirmed DCARE lifecycle repair 2026-09-22'},db)
  results.push({branch:'B'+code,name,lifecycleStatus:status,...sync})
 }
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Foreign key check failed')
 db.exec(apply?'COMMIT':'ROLLBACK')
 console.log(JSON.stringify({mode:apply?'applied':'preview',startDate:kuchingDate(),results},null,2))
 }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error}
}finally{db?.close();defaultDb?.close();rmSync(temporary,{recursive:true,force:true})}
