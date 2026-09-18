// Live permissions, deliberately without an expiry or cached authorization.
export function branchCollectionOpen(db,branchId){
 return Boolean(db.prepare(`SELECT 1 FROM branches b JOIN areas a ON a.id=b.area_id JOIN zone_groups z ON z.id=a.zone_group_id JOIN zone_collection_access x ON x.zone_id=z.id WHERE b.id=? AND z.is_active=1 AND x.is_open=1`).get(Number(branchId)))
}
export function stopCollectionOpen(db,stopId){
 const s=db.prepare('SELECT branch_id FROM dispatch_stops WHERE id=?').get(Number(stopId));return Boolean(s&&branchCollectionOpen(db,s.branch_id))
}
export function flexibleExecution(db,stopId){
 if(stopCollectionOpen(db,stopId))return true
 // Closing never strands work already arrived under the open-area permission.
 return Boolean(db.prepare('SELECT 1 FROM flexible_collection_claims f JOIN dispatch_stops s ON s.id=f.stop_id WHERE s.id=? AND s.arrived_at IS NOT NULL').get(Number(stopId)))
}
