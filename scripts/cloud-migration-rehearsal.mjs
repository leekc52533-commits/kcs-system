import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const args=process.argv.slice(2)
const value=name=>{const index=args.indexOf(name);return index>=0?args[index+1]:null}
const backup=value('--backup'),snapshot=value('--snapshot')
if(!backup||!snapshot)throw new Error('Usage: node scripts/cloud-migration-rehearsal.mjs --backup <verified-sqlite-backup> --snapshot <preflight-json>')
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
run('scripts/migrate.mjs')
run('scripts/cloud-preflight.mjs',['--mode','after','--snapshot',snapshotPath])
console.log(JSON.stringify({ok:true,productionDatabaseUntouched:true,rehearsalPath},null,2))
