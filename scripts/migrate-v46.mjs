import {DatabaseSync} from 'node:sqlite'
import path from 'node:path'
import {applyV46Migration} from '../server/migrationV46.mjs'
const databasePath=path.resolve(process.env.KCS_DB_PATH||'data/kcs-dispatch.db')
const db=new DatabaseSync(databasePath)
db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000')
try{console.log(JSON.stringify({databasePath,...applyV46Migration(db),integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,foreignKeyErrors:db.prepare('SELECT COUNT(*) n FROM pragma_foreign_key_check').get().n},null,2))}finally{db.close()}
