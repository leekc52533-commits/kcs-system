import {db,databasePath} from '../server/database.mjs'
import {applyV40Migration} from '../server/migrationV40.mjs'
console.log(JSON.stringify({databasePath,...applyV40Migration(db)},null,2))
