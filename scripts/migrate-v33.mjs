import {db,databasePath} from '../server/database.mjs'
import {applyV33Migration} from '../server/migrationV33.mjs'
console.log(JSON.stringify({databasePath,...applyV33Migration(db)},null,2))
