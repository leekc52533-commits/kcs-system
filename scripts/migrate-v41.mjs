import {db,databasePath} from '../server/database.mjs'
import {applyV41Migration} from '../server/migrationV41.mjs'
console.log(JSON.stringify({databasePath,...applyV41Migration(db)},null,2))
