import {db,databasePath} from '../server/database.mjs'
import {applyV34Migration} from '../server/migrationV34.mjs'
console.log(JSON.stringify({databasePath,...applyV34Migration(db)},null,2))
