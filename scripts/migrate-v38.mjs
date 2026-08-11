import {db,databasePath} from '../server/database.mjs'
import {applyV38Migration} from '../server/migrationV38.mjs'
console.log(JSON.stringify({databasePath,...applyV38Migration(db)},null,2))
