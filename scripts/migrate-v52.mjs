import {DatabaseSync} from 'node:sqlite'
import {applyV52Migration} from '../server/migrationV52.mjs'

const databasePath=process.env.KCS_DB_PATH||'/var/lib/kcs/data/kcs-dispatch.db'
const db=new DatabaseSync(databasePath)
db.exec('PRAGMA foreign_keys=ON')
try{console.log(JSON.stringify({databasePath,...applyV52Migration(db),integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,foreignKeyErrors:db.prepare('SELECT COUNT(*) n FROM pragma_foreign_key_check').get().n},null,2))}finally{db.close()}
