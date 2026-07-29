import {DatabaseSync} from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import {applyV20Migration} from '../server/migrationV20.mjs'

if(!process.env.KCS_DB_PATH)throw new Error('KCS_DB_PATH is required; v20 migration never uses or uploads a local database')
const databasePath=path.resolve(process.env.KCS_DB_PATH)
if(!fs.existsSync(databasePath))throw new Error(`Database not found: ${databasePath}`)
const db=new DatabaseSync(databasePath)
db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;')
const beforeVersion=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
if(beforeVersion!==19)throw new Error(`Migration requires schema v19 input; found v${beforeVersion}`)
const beforeCounts={customers:db.prepare('SELECT COUNT(*) count FROM customers').get().count,branches:db.prepare('SELECT COUNT(*) count FROM branches').get().count,employees:db.prepare('SELECT COUNT(*) count FROM employees').get().count,dispatchStops:db.prepare('SELECT COUNT(*) count FROM dispatch_stops').get().count}
const migrated=applyV20Migration(db),integrity=db.prepare('PRAGMA integrity_check').get().integrity_check
if(integrity!=='ok')throw new Error(`Migration integrity check failed: ${integrity}`)
const afterCounts={customers:db.prepare('SELECT COUNT(*) count FROM customers').get().count,branches:db.prepare('SELECT COUNT(*) count FROM branches').get().count,employees:db.prepare('SELECT COUNT(*) count FROM employees').get().count,dispatchStops:db.prepare('SELECT COUNT(*) count FROM dispatch_stops').get().count}
for(const key of Object.keys(beforeCounts))if(afterCounts[key]!==beforeCounts[key])throw new Error(`${key} count changed during schema-only migration`)
console.log(JSON.stringify({ok:true,databasePath,beforeVersion,schemaVersion:20,migrated,beforeCounts,afterCounts,integrity},null,2))
db.close()
