// Repair only explicit request-to-branch relationships; never match customer names.
export function resolveGpsRequestBranch(db,requestId){
 if(!requestId)return null
 const r=db.prepare('SELECT existing_branch_id,linked_branch_id FROM special_collection_requests WHERE id=?').get(requestId)
 if(!r?.existing_branch_id)return null
 const b=db.prepare('SELECT id,jodoo_branch_id FROM branches WHERE id=?').get(r.existing_branch_id)
 const code=v=>String(v??'').replace(/^B/i,'').toUpperCase()
 if(!b||(r.linked_branch_id&&code(r.linked_branch_id)!==code(b.jodoo_branch_id)))return null
 return b.id
}
export function repairGpsRequestLinks(db){
 db.exec('SAVEPOINT gps_request_links')
 let count=0
 try{
  const rows=db.prepare('SELECT id,special_request_id FROM temporary_locations WHERE branch_id IS NULL AND special_request_id IS NOT NULL').all()
  for(const r of rows){
   const branchId=resolveGpsRequestBranch(db,r.special_request_id)
   if(!branchId)continue
   db.prepare('UPDATE temporary_locations SET branch_id=? WHERE id=? AND branch_id IS NULL').run(branchId,r.id)
   db.prepare("INSERT INTO audit_logs(action,entity_type,entity_id,before_json,after_json) VALUES('gps_request_branch_link_repaired','temporary_location',?,?,?)").run(String(r.id),JSON.stringify({branch_id:null}),JSON.stringify({branch_id:branchId,special_request_id:r.special_request_id,source:'explicit_special_request_link'}))
   count++
  }
  db.exec('RELEASE gps_request_links');return count
 }catch(e){db.exec('ROLLBACK TO gps_request_links');db.exec('RELEASE gps_request_links');throw e}
}
