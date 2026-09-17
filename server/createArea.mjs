import {canManageDispatch} from '../shared/dispatchAccess.js'
const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode})}
export function createArea(db,account,payload){
 if(!canManageDispatch(account))fail('areaCreate.denied',403)
 const name=String(payload.name||'').trim().replace(/\s+/g,' '),zoneId=Number(payload.zoneGroupId)
 if(!name||name.length>120)fail('areaCreate.nameRequired')
 if(!Number.isSafeInteger(zoneId)||zoneId<=0)fail('areaCreate.zoneRequired')
 db.exec('BEGIN IMMEDIATE')
 try{
  if(!db.prepare('SELECT id FROM zone_groups WHERE id=? AND is_active=1').get(zoneId))fail('areaCreate.zoneRequired')
  if(db.prepare('SELECT name FROM areas').all().some(r=>r.name.trim().replace(/\s+/g,' ').toLowerCase()===name.toLowerCase()))fail('areaCreate.duplicate',409)
  const max=db.prepare("SELECT MAX(CAST(jodoo_area_id AS INTEGER)) n FROM areas WHERE jodoo_area_id<>'' AND jodoo_area_id NOT GLOB '*[^0-9]*'").get().n
  const next=Math.max(10000,Number(max)||0)+1
  if(!Number.isSafeInteger(next))fail('areaCreate.failed')
  const actor=account.employeeName||account.name||String(account.id)
  const id=Number(db.prepare("INSERT INTO areas(jodoo_area_id,name,zone_group_id,confirmed_zone_group_id,zone_assignment_status,zone_confirmed_by,zone_confirmed_at,is_active) VALUES(?,?,?,?,'confirmed',?,CURRENT_TIMESTAMP,1)").run(String(next),name,zoneId,zoneId,actor).lastInsertRowid)
  const result={id,areaId:String(next),name,zoneGroupId:zoneId}
  db.prepare("INSERT INTO audit_logs(action,entity_type,entity_id,after_json) VALUES('area_created','area',?,?)").run(String(id),JSON.stringify({...result,actor,accountId:account.id}))
  db.exec('COMMIT');return result
 }catch(error){db.exec('ROLLBACK');throw error}
}

export function renameArea(db,account,id,payload){
 if(!canManageDispatch(account))fail('Area management permission required.',403)
 const name=String(payload.name||'').trim().replace(/\s+/g,' '),reason=String(payload.reason||'').trim()
 if(!name||name.length>120||!reason)fail('Name and reason are required.')
 db.exec('BEGIN IMMEDIATE')
 try{
  const before=db.prepare('SELECT * FROM areas WHERE id=?').get(id)
  if(!before)fail('Area not found.',404)
  if(before.name!==payload.expectedName)fail('Area name changed. Reload before saving.',409)
  if(before.name===name){db.exec('COMMIT');return before}
  if(db.prepare('SELECT id,name FROM areas WHERE id<>?').all(id).some(a=>a.name.trim().replace(/\s+/g,' ').toLowerCase()===name.toLowerCase()))fail('Area name already exists.',409)
  db.prepare('UPDATE areas SET name=? WHERE id=?').run(name,id)
  const after=db.prepare('SELECT * FROM areas WHERE id=?').get(id),actor=account.employeeName||account.name||account.username||String(account.id)
  db.prepare("INSERT INTO master_change_history(entity_type,entity_id,change_type,field_name,old_value,new_value,before_json,after_json,reason,changed_by) VALUES('area',?,'renamed','name',?,?,?,?,?,?)").run(String(before.jodoo_area_id||id),before.name,name,JSON.stringify(before),JSON.stringify(after),reason,actor)
  db.prepare("INSERT INTO audit_logs(action,entity_type,entity_id,before_json,after_json) VALUES('area_renamed','area',?,?,?)").run(String(id),JSON.stringify({name:before.name}),JSON.stringify({name,reason,actor,accountId:account.id}))
  db.exec('COMMIT');return after
 }catch(error){db.exec('ROLLBACK');throw error}
}
