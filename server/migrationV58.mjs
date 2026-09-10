export const dateReviewSchemaSql=`
CREATE TABLE IF NOT EXISTS driver_date_reviews (
 request_id INTEGER PRIMARY KEY REFERENCES driver_date_requests(id),
 branch_id INTEGER NOT NULL REFERENCES branches(id),
 approved_date TEXT NOT NULL,
 route_number INTEGER NOT NULL,
 scope TEXT NOT NULL CHECK(scope IN ('once','permanent')),
 schedule_before_json TEXT,
 schedule_after_json TEXT,
 preserved_dates_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS driver_date_reviews_branch_date ON driver_date_reviews(branch_id,approved_date);
`
export const ensureV58Schema=db=>db.exec(dateReviewSchemaSql)
export function applyV58Migration(db){
 const version=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
 if(version>=58){ensureV58Schema(db);return{schemaVersion:version,noOp:true}}
 if(version!==57)throw new Error('Schema 57 is required')
 db.exec('BEGIN IMMEDIATE')
 try{ensureV58Schema(db);db.exec('INSERT INTO schema_meta(version) VALUES(58)');if(db.prepare('PRAGMA foreign_key_check').get())throw new Error('Foreign-key check failed');db.exec('COMMIT');return{schemaVersion:58}}
 catch(e){db.exec('ROLLBACK');throw e}
}
