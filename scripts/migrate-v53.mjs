import {db} from '../server/database.mjs'
import {applyV53Migration} from '../server/migrationV53.mjs'
const result=applyV53Migration(db),integrity=db.prepare('PRAGMA integrity_check').get().integrity_check,foreignKeyErrors=db.prepare('PRAGMA foreign_key_check').all().length
console.log(JSON.stringify({...result,integrity,foreignKeyErrors}))
