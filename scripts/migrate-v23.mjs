import {DatabaseSync} from 'node:sqlite'
import {applyV23Migration} from '../server/migrationV23.mjs'

const databasePath=process.env.KCS_DB_PATH
if(!databasePath)throw new Error('KCS_DB_PATH must explicitly identify the database to migrate')
const db=new DatabaseSync(databasePath)
db.exec('PRAGMA busy_timeout=5000')
const beforeSchema=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
const result=applyV23Migration(db)
const integrity=db.prepare('PRAGMA integrity_check').get().integrity_check
console.log(JSON.stringify({databasePath,beforeSchema,afterSchema:result.schemaVersion,integrity,...result},null,2))
db.close()
