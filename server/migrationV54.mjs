import {sundaySchemaSql} from './sundayPlanning.mjs'
export const ensureV54Schema=db=>db.exec(sundaySchemaSql)
export function applyV54Migration(db){
 const version=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
 if(version>=54){ensureV54Schema(db);return{schemaVersion:version,noOp:true}}
 if(version!==53)throw new Error('Schema 53 is required')
 db.exec('BEGIN IMMEDIATE')
 try{ensureV54Schema(db);db.exec('INSERT INTO schema_meta(version) VALUES(54)');if(db.prepare('PRAGMA foreign_key_check').get())throw new Error('Foreign-key check failed');db.exec('COMMIT');return{schemaVersion:54}}
 catch(e){db.exec('ROLLBACK');throw e}
}
