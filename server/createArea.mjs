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
