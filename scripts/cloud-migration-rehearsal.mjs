import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const args=process.argv.slice(2)
const parseArgs=items=>{
  const parsed={}
  for(let index=0;index<items.length;index++){
    const name=items[index]
    if(!['--from','--to','--backup','--snapshot'].includes(name))throw new Error(`Unknown or positional argument: ${name}`)
    if(Object.hasOwn(parsed,name))throw new Error(`Duplicate ${name}`)
    const value=items[++index]
    if(!value||value.startsWith('--'))throw new Error(`${name} requires exactly one value`)
    parsed[name]=value
  }
  if(parsed['--from']!=='16'||parsed['--to']!=='17'||!parsed['--backup']||!parsed['--snapshot'])throw new Error('Required arguments are --from 16 --to 17 --backup <path> --snapshot <path>')
  return parsed
}
let parsed
try{parsed=parseArgs(args)}catch(error){throw new Error(`Historical v17 rehearsal only. Usage: node scripts/cloud-migration-rehearsal.mjs --from 16 --to 17 --backup <verified-sqlite-backup> --snapshot <v16-preflight-json>. ${error.message}`)}
const backup=parsed['--backup'],snapshot=parsed['--snapshot']
const backupPath=path.resolve(backup),snapshotPath=path.resolve(snapshot)
if(!fs.existsSync(backupPath)||!fs.existsSync(snapshotPath))throw new Error('Backup or preflight snapshot not found')
const rehearsalPath=path.join(path.dirname(backupPath),`v17-rehearsal-${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')}.sqlite`)
fs.copyFileSync(backupPath,rehearsalPath,fs.constants.COPYFILE_EXCL)
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const run=(script,extra=[])=>{
  const result=spawnSync(process.execPath,[script,...extra],{cwd:root,env:{...process.env,KCS_DB_PATH:rehearsalPath},encoding:'utf8'})
  if(result.stdout)process.stdout.write(result.stdout)
  if(result.stderr)process.stderr.write(result.stderr)
  if(result.status!==0)throw new Error(`${script} failed on rehearsal copy`)
}
run('scripts/migrate.mjs',['--from','16','--to','17','--confirm-migration'])
run('scripts/verify-v17-rehearsal.mjs',['--snapshot',snapshotPath])
console.log(JSON.stringify({ok:true,from:16,to:17,productionDatabaseUntouched:true,rehearsalPath,snapshotPath,verifiedAfterMigration:true},null,2))
