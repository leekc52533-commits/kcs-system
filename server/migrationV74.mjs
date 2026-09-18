export const flexibleCollectionSchema=`
CREATE TABLE IF NOT EXISTS zone_collection_access(
 zone_id INTEGER PRIMARY KEY REFERENCES zone_groups(id),is_open INTEGER NOT NULL DEFAULT 0 CHECK(is_open IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 0,changed_by INTEGER NOT NULL,changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS zone_collection_access_events(
 id INTEGER PRIMARY KEY,zone_id INTEGER NOT NULL REFERENCES zone_groups(id),is_open INTEGER NOT NULL,
 account_id INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS flexible_collection_claims(
 stop_id INTEGER PRIMARY KEY REFERENCES dispatch_stops(id),employee_id INTEGER NOT NULL REFERENCES employees(id),
 actor TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`
export function applyV74Migration(db){const v=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v);if(v>=74){db.exec(flexibleCollectionSchema);return}if(v!==73)throw Error('Schema 73 required');db.exec('BEGIN IMMEDIATE');try{db.exec(flexibleCollectionSchema);db.exec('INSERT INTO schema_meta(version) VALUES(74)');db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}
