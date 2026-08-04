import {DatabaseSync} from 'node:sqlite'
import {applyDuplicateScheduleCleanup,previewDuplicateScheduleCleanup} from '../server/duplicateScheduleCleanupService.mjs'
const args=process.argv.slice(2),value=name=>{const index=args.indexOf(name);return index>=0?args[index+1]:null},databasePath=value('--database')||process.env.KCS_DB_PATH,apply=args.includes('--apply')
if(!databasePath)throw new Error('--database or KCS_DB_PATH is required')
if(apply&&!args.includes('--confirm-approved-plan'))throw new Error('--apply requires --confirm-approved-plan')
const database=new DatabaseSync(databasePath);database.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000')
try{const beforeIntegrity=database.prepare('PRAGMA integrity_check').get().integrity_check;if(beforeIntegrity!=='ok')throw new Error(`Integrity check failed: ${beforeIntegrity}`);const preview=previewDuplicateScheduleCleanup(database);const result=apply?applyDuplicateScheduleCleanup(database,{changedBy:value('--changed-by'),reason:value('--reason')}):preview;console.log(JSON.stringify({databasePath,mode:apply?'apply':'dry-run',beforeIntegrity,result,afterIntegrity:database.prepare('PRAGMA integrity_check').get().integrity_check},null,2))}finally{database.close()}
