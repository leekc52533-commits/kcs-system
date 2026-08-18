import {DatabaseSync} from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import {applyV42Migration} from '../server/migrationV42.mjs'
if(!process.env.KCS_DB_PATH)throw new Error('KCS_DB_PATH is required; no database path is inferred')
const databasePath=path.resolve(process.env.KCS_DB_PATH);if(!fs.existsSync(databasePath))throw new Error(`Database not found: ${databasePath}`)
const db=new DatabaseSync(databasePath);db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000');try{console.log(JSON.stringify({databasePath,...applyV42Migration(db)},null,2))}finally{db.close()}
