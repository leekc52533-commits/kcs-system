import {db,databasePath} from '../server/database.mjs'
import {applyV31Migration} from '../server/migrationV31.mjs'
console.log(JSON.stringify({databasePath,...applyV31Migration(db)},null,2))
