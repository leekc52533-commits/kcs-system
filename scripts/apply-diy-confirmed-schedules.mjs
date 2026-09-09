import {DatabaseSync,backup} from 'node:sqlite'
import {mkdirSync} from 'node:fs'
import path from 'node:path'
import {applyDiyConfirmedSchedules} from '../server/diyConfirmedSchedules.mjs'
const databasePath=process.env.KCS_DB_PATH
if(!databasePath)throw Error('KCS_DB_PATH is required')
const apply=process.argv.includes('--apply'),db=new DatabaseSync(databasePath)
db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=10000')
try{
 if(db.prepare('SELECT MAX(version) n FROM schema_meta').get().n!==54)throw Error('Expected schema 54')
 const preview=applyDiyConfirmedSchedules(db)
 if(apply&&preview.items.some(i=>i.status!=='already_applied')){
 const directory=path.join(path.dirname(databasePath),'backups');mkdirSync(directory,{recursive:true,mode:0o750})
 const destination=path.join(directory,'kcs-pre-diy-schedules-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');await backup(db,destination);console.log('BACKUP='+destination)
 }
 console.log(JSON.stringify(apply?applyDiyConfirmedSchedules(db,{apply:true}):preview,null,2))
 console.log('INTEGRITY='+db.prepare('PRAGMA integrity_check').get().integrity_check)
}catch(error){console.error(error.message);process.exitCode=1}finally{db.close()}
