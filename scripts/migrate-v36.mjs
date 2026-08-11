import {db,databasePath} from '../server/database.mjs'
import {applyV36Migration} from '../server/migrationV36.mjs'
console.log(JSON.stringify({databasePath,...applyV36Migration(db)},null,2))
