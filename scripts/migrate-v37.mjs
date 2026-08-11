import {db,databasePath} from '../server/database.mjs'
import {applyV37Migration} from '../server/migrationV37.mjs'
console.log(JSON.stringify({databasePath,...applyV37Migration(db)},null,2))
