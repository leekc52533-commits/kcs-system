import {DatabaseSync} from 'node:sqlite'
import {applyVehicleMasterV29} from '../server/vehicleMasterV29Data.mjs'
const databasePath=process.env.KCS_DB_PATH,actorName=process.env.KCS_SYSTEM_ACTOR;if(!databasePath)throw new Error('KCS_DB_PATH must explicitly identify the database');if(!actorName)throw new Error('KCS_SYSTEM_ACTOR is required')
const database=new DatabaseSync(databasePath);database.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000');const result=applyVehicleMasterV29(database,{actorName}),integrity=database.prepare('PRAGMA integrity_check').get().integrity_check;console.log(JSON.stringify({databasePath,integrity,...result},null,2));database.close()
