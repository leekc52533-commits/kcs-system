import {DatabaseSync} from 'node:sqlite'
import {applyV30Migration} from '../server/migrationV30.mjs'
const databasePath=process.env.KCS_DB_PATH;if(!databasePath)throw new Error('KCS_DB_PATH must explicitly identify the database to migrate')
const database=new DatabaseSync(databasePath);database.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000');const result=applyV30Migration(database),integrity=database.prepare('PRAGMA integrity_check').get().integrity_check;console.log(JSON.stringify({databasePath,integrity,...result},null,2));database.close()
