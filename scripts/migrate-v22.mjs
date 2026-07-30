import {DatabaseSync} from 'node:sqlite'
import {applyV22Migration} from '../server/migrationV22.mjs'

const dbPath=process.env.KCS_DB_PATH
if(!dbPath)throw new Error('KCS_DB_PATH must explicitly identify the database to migrate')
const db=new DatabaseSync(dbPath)
db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000')
const before=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
const result=applyV22Migration(db)
const integrity=db.prepare('PRAGMA integrity_check').get().integrity_check
console.log(JSON.stringify({databasePath:dbPath,beforeSchema:before,afterSchema:result.schemaVersion,integrity,...result},null,2))
db.close()
