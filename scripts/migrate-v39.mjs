import {db,databasePath} from '../server/database.mjs'
import {applyV39Migration} from '../server/migrationV39.mjs'
console.log(JSON.stringify({databasePath,...applyV39Migration(db)},null,2))
