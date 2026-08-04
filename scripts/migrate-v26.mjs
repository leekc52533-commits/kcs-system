import {DatabaseSync} from 'node:sqlite'
import {applyV26Migration} from '../server/migrationV26.mjs'
const databasePath=process.env.KCS_DB_PATH
if(!databasePath)throw new Error('KCS_DB_PATH must explicitly identify the database to migrate')
const database=new DatabaseSync(databasePath);database.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000')
const beforeSchema=Number(database.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
const result=applyV26Migration(database),integrity=database.prepare('PRAGMA integrity_check').get().integrity_check
console.log(JSON.stringify({databasePath,beforeSchema,afterSchema:result.schemaVersion,integrity,...result},null,2));database.close()
