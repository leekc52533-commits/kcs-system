import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
if(process.env.KCS_BACKUP_CONFIRMED_SERVICE_STOPPED!=='1')throw new Error('Stop database writers and set KCS_BACKUP_CONFIRMED_SERVICE_STOPPED=1')
const databasePath=path.resolve(process.env.KCS_DB_PATH||''),uploadsRoot=path.resolve(process.env.KCS_UPLOADS_DIR||''),backupRoot=path.resolve(process.env.KCS_BACKUP_DIR||'')
if(!process.env.KCS_DB_PATH||!process.env.KCS_UPLOADS_DIR||!process.env.KCS_BACKUP_DIR)throw new Error('KCS_DB_PATH, KCS_UPLOADS_DIR and KCS_BACKUP_DIR are required')
const database=new DatabaseSync(databasePath,{readOnly:true});if(database.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Source database integrity check failed');database.close()
const backupId=`vehicle-data-${new Date().toISOString().replace(/[:.]/g,'')}`,destination=path.join(backupRoot,backupId),files=[];fs.mkdirSync(destination,{recursive:false});fs.copyFileSync(databasePath,path.join(destination,'kcs-dispatch.db'))
const sourceDocuments=path.join(uploadsRoot,'vehicles'),targetDocuments=path.join(destination,'vehicles');if(fs.existsSync(sourceDocuments))fs.cpSync(sourceDocuments,targetDocuments,{recursive:true,errorOnExist:true})
const walk=folder=>{for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const absolute=path.join(folder,entry.name);if(entry.isDirectory())walk(absolute);else{const buffer=fs.readFileSync(absolute);files.push({path:path.relative(destination,absolute).replaceAll('\\','/'),size:buffer.length,sha256:crypto.createHash('sha256').update(buffer).digest('hex')})}}};walk(destination);fs.writeFileSync(path.join(destination,'sha256-manifest.json'),JSON.stringify({backupId,createdAt:new Date().toISOString(),files},null,2));console.log(JSON.stringify({backupId,destination,fileCount:files.length},null,2))
