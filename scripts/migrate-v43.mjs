import {DatabaseSync} from 'node:sqlite'
import path from 'node:path'
import {applyV43Migration} from '../server/migrationV43.mjs'
const db=new DatabaseSync(path.resolve(process.env.KCS_DB_PATH||'data/kcs-dispatch.db'));db.exec('PRAGMA foreign_keys=ON');console.log(applyV43Migration(db));db.close()
