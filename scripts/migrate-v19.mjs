import {DatabaseSync} from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import {applyV19Migration} from '../server/migrationV19.mjs'

if(!process.env.KCS_DB_PATH)throw new Error('KCS_DB_PATH is required; v19 migration never uses or uploads a local database')
const databasePath=path.resolve(process.env.KCS_DB_PATH)
if(!fs.existsSync(databasePath))throw new Error(`Database not found: ${databasePath}`)
const db=new DatabaseSync(databasePath)
db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;')
const beforeVersion=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
if(beforeVersion!==18)throw new Error(`Migration requires schema v18 input; found v${beforeVersion}. Run migrate:v18 first when starting from v17.`)
const beforeCounts={customers:db.prepare('SELECT COUNT(*) count FROM customers').get().count,branches:db.prepare('SELECT COUNT(*) count FROM branches').get().count,employees:db.prepare('SELECT COUNT(*) count FROM employees').get().count,authAccounts:db.prepare('SELECT COUNT(*) count FROM auth_accounts').get().count,branchMaterials:db.prepare('SELECT COUNT(*) count FROM branch_material_prices').get().count}
const migrated=applyV19Migration(db),integrity=db.prepare('PRAGMA integrity_check').get().integrity_check
if(integrity!=='ok')throw new Error(`Migration integrity check failed: ${integrity}`)
const afterCounts={customers:db.prepare('SELECT COUNT(*) count FROM customers').get().count,branches:db.prepare('SELECT COUNT(*) count FROM branches').get().count,employees:db.prepare('SELECT COUNT(*) count FROM employees').get().count,authAccounts:db.prepare('SELECT COUNT(*) count FROM auth_accounts').get().count,branchMaterials:db.prepare('SELECT COUNT(*) count FROM branch_material_prices').get().count}
for(const key of Object.keys(beforeCounts))if(afterCounts[key]!==beforeCounts[key])throw new Error(`${key} count changed during schema-only migration`)
const schemaVersion=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
console.log(JSON.stringify({ok:true,databasePath,beforeVersion,schemaVersion,migrated,beforeCounts,afterCounts,scope:'schema-v19-customer-standard-outstation-pricing',integrity},null,2))
db.close()
