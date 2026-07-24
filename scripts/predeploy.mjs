import {DatabaseSync} from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const databasePath=path.resolve(process.env.KCS_DB_PATH||path.join(root,'data','kcs-dispatch.db'))
const backupDir=path.resolve(process.env.KCS_BACKUP_DIR||path.join(root,'data','backups'))
fs.mkdirSync(backupDir,{recursive:true})
if(!fs.existsSync(databasePath))throw new Error(`Database not found: ${databasePath}`)
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')
const backupPath=path.join(backupDir,`kcs-dispatch-predeploy-${stamp}.sqlite`)
const quote=value=>`'${String(value).replaceAll("'","''")}'`
const source=new DatabaseSync(databasePath)
try{
  source.exec('PRAGMA wal_checkpoint(FULL)')
  const sourceIntegrity=source.prepare('PRAGMA integrity_check').get().integrity_check
  if(sourceIntegrity!=='ok')throw new Error(`Source integrity check failed: ${sourceIntegrity}`)
  source.exec(`VACUUM INTO ${quote(backupPath)}`)
}finally{source.close()}
const backup=new DatabaseSync(backupPath,{readOnly:true})
try{
  const result=backup.prepare('PRAGMA integrity_check').get().integrity_check
  if(result!=='ok')throw new Error(`Backup integrity check failed: ${result}`)
}finally{backup.close()}
console.log(JSON.stringify({ok:true,databasePath,backupPath,integrity:'ok'},null,2))
