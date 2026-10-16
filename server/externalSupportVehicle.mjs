// KC confirmed: retain QTW2704's sold history while enabling occasional external support.
export function enableQtw2704Support(db){
 const matches=db.prepare("SELECT * FROM vehicles WHERE REPLACE(REPLACE(UPPER(COALESCE(registration_number,'')),' ',''),'-','')='QTW2704'").all()
 if(matches.length!==1)throw Error('Expected one QTW2704 vehicle; external support migration requires review')
 const before=matches[0]
 if(before.is_external_support)return {noOp:true}
 db.exec('BEGIN IMMEDIATE')
 try{
  db.prepare("UPDATE vehicles SET is_external_support=1,operational_status='available',status='available',is_common=0,official_sequence=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(before.id)
  db.prepare("INSERT INTO vehicle_status_history(vehicle_id,previous_status,new_status,reason,changed_by) VALUES(?,?,'available',?,'KC confirmed external support migration')").run(before.id,before.operational_status,'Sold to an external company; enable sales billing and manual support only.')
  const after=db.prepare('SELECT * FROM vehicles WHERE id=?').get(before.id)
  db.prepare("INSERT INTO master_change_history(entity_type,entity_id,change_type,before_json,after_json,reason,changed_by) VALUES('vehicle',?,'external_support_enabled',?,?,?,'KC confirmed external support migration')").run(String(before.id),JSON.stringify(before),JSON.stringify(after),'QTW2704 only; preserve sold date, identity and historical records')
  db.exec('COMMIT');return {vehicleId:before.id}
 }catch(e){db.exec('ROLLBACK');throw e}
}
