// Reading a proof does not grant any dispatch editing or completion rights.
export const isNoGoodsPhotoPath=pathname=>/^\/api\/driver-no-goods\/\d+\/photo$/.test(pathname)
export function noGoodsProofForViewer(database,id,session){
 const proof=database.prepare(`SELECT p.storage_key,p.content_type,p.driver_employee_id,d.driver_id,d.assistant_id,d.vehicle_id,t.dispatch_day_id FROM driver_no_goods_proofs p JOIN dispatch_trips t ON t.id=p.dispatch_trip_id JOIN dispatches d ON d.id=t.dispatch_id WHERE p.id=?`).get(Number(id))
 if(!proof)return null
 const employeeId=Number(session.employeeId),privileged=['owner','owner_admin','supervisor','dispatcher'].includes(String(session.role).toLowerCase())
 const own=employeeId>0&&([proof.driver_employee_id,proof.driver_id,proof.assistant_id].some(value=>Number(value)===employeeId)||Boolean(database.prepare('SELECT 1 FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND vehicle_id=? AND employee_id=?').get(proof.dispatch_day_id,proof.vehicle_id,employeeId)))
 if(!privileged&&!own)throw Object.assign(new Error('You do not have permission to view this proof.'),{statusCode:403,code:'PERMISSION_DENIED'})
 return {storage_key:proof.storage_key,content_type:proof.content_type}
}
