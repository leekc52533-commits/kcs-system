export const routeCollectionSchema=`
CREATE TABLE IF NOT EXISTS route_collection_access(
 route_number INTEGER PRIMARY KEY CHECK(route_number BETWEEN 1 AND 5),
 is_open INTEGER NOT NULL DEFAULT 0 CHECK(is_open IN (0,1)),revision INTEGER NOT NULL DEFAULT 0,
 changed_by INTEGER,changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS route_collection_access_events(
 id INTEGER PRIMARY KEY,route_number INTEGER NOT NULL,is_open INTEGER NOT NULL,
 account_id INTEGER,reason TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`
export function applyV76Migration(db){
 const v=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
 if(v>=76){db.exec(routeCollectionSchema);return}
 if(v!==75)throw Error('Schema 75 required')
 db.exec('BEGIN IMMEDIATE')
 try{
  db.exec(routeCollectionSchema)
  if(!db.prepare('PRAGMA table_info(flexible_collection_claims)').all().some(c=>c.name==='source_route_number'))db.exec('ALTER TABLE flexible_collection_claims ADD COLUMN source_route_number INTEGER')
  db.exec('UPDATE flexible_collection_claims SET source_route_number=(SELECT route_number FROM dispatch_stops WHERE id=stop_id) WHERE source_route_number IS NULL')
  for(let route=1;route<=5;route++){
   // Only carry over a fully open route. Partial geographic permissions cannot grant an entire route.
   const branches=db.prepare(`SELECT DISTINCT b.id,COALESCE(x.is_open,0) is_open,COALESCE(z.is_active,0) active FROM weekly_route_plan_stops s JOIN weekly_route_plans p ON p.id=s.plan_id AND p.is_active=1 JOIN branches b ON b.id=s.branch_id LEFT JOIN areas a ON a.id=b.area_id LEFT JOIN zone_groups z ON z.id=a.zone_group_id LEFT JOIN zone_collection_access x ON x.zone_id=z.id WHERE s.route_number=?`).all(route)
   const open=Number(branches.length>0&&branches.every(b=>b.is_open&&b.active))
   db.prepare('INSERT OR IGNORE INTO route_collection_access(route_number,is_open) VALUES(?,?)').run(route,open)
   db.prepare('INSERT INTO route_collection_access_events(route_number,is_open,reason) VALUES(?,?,?)').run(route,open,'Migrated from geographic controls; partial or unmapped routes default closed')
  }
  db.exec('INSERT INTO schema_meta(version) VALUES(76);COMMIT')
 }catch(e){db.exec('ROLLBACK');throw e}
}
