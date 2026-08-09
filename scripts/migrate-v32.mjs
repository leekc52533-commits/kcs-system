import {db,databasePath} from '../server/database.mjs'
import {applyV32Migration} from '../server/migrationV32.mjs'
console.log(JSON.stringify({databasePath,...applyV32Migration(db)},null,2))
