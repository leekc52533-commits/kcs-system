import {DatabaseSync} from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const databasePath=path.resolve(process.env.KCS_DB_PATH||path.join(root,'data','kcs-dispatch.db'))
const backupDir=path.resolve(process.env.KCS_BACKUP_DIR||path.join(root,'data','backups'))
const args=process.argv.slice(2),backupArg=args[args.indexOf('--backup')+1]
if(!args.includes('--confirm')||!backupArg)throw new Error('Usage: npm run rollback:kcs -- --backup data/backups/<file>.sqlite --confirm')
const backupPath=path.resolve(root,backupArg),backupRoot=`${backupDir}${path.sep}`
if(!backupPath.startsWith(backupRoot)||!fs.existsSync(backupPath))throw new Error('Backup must be an existing file inside data/backups')
const backup=new DatabaseSync(backupPath,{readOnly:true})
try{if(backup.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Backup integrity check failed')}finally{backup.close()}
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')
const safetyPath=path.join(backupDir,`kcs-dispatch-before-rollback-${stamp}.sqlite`)
for(const suffix of ['-wal','-shm'])if(fs.existsSync(`${databasePath}${suffix}`))throw new Error(`Stop the KCS API before rollback; active SQLite file found: ${databasePath}${suffix}`)
if(fs.existsSync(databasePath))fs.copyFileSync(databasePath,safetyPath)
fs.copyFileSync(backupPath,databasePath)
const restored=new DatabaseSync(databasePath,{readOnly:true})
try{if(restored.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Restored database integrity check failed')}finally{restored.close()}
console.log(JSON.stringify({ok:true,restoredFrom:backupPath,databasePath,safetyPath,integrity:'ok'},null,2))
