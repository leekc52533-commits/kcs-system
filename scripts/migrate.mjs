import {DatabaseSync} from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import {applyV17Migration} from '../server/migrationV17.mjs'

const args=process.argv.slice(2)
if(!args.includes('--confirm-migration')||args[args.indexOf('--from')+1]!=='16'||args[args.indexOf('--to')+1]!=='17')throw new Error('Legacy migrate:kcs is v16→v17 only and refuses implicit execution. Use migrate:v16-to-v17 with --confirm-migration after backup rehearsal and human approval; never use it for a v41 code-only deployment.')
if(!process.env.KCS_DB_PATH)throw new Error('KCS_DB_PATH is required; migration never uses a default or local database')
const databasePath=path.resolve(process.env.KCS_DB_PATH)
if(!fs.existsSync(databasePath))throw new Error(`Database not found: ${databasePath}`)
const db=new DatabaseSync(databasePath)
db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;')
const beforeVersion=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
if(beforeVersion!==16)throw new Error(`Migration requires schema v16 input; found v${beforeVersion}`)
const migrated=applyV17Migration(db)
const integrity=db.prepare('PRAGMA integrity_check').get().integrity_check
if(integrity!=='ok')throw new Error(`Migration integrity check failed: ${integrity}`)
const schemaVersion=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
console.log(JSON.stringify({ok:true,databasePath,beforeVersion,schemaVersion,migrated,scope:'schema-v17-only',integrity},null,2))
db.close()
