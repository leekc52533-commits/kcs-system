import {db,databasePath} from '../server/database.mjs'
import {applyV35Migration} from '../server/migrationV35.mjs'
console.log(JSON.stringify({databasePath,...applyV35Migration(db)},null,2))
