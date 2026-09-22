export const dateSystemReviewSchema=`CREATE TABLE IF NOT EXISTS driver_date_system_reviews(
 request_id INTEGER PRIMARY KEY REFERENCES driver_date_requests(id),
 branch_id INTEGER NOT NULL REFERENCES branches(id),
 proposal_json TEXT NOT NULL,
 first_account_id INTEGER NOT NULL,
 first_employee_id INTEGER NOT NULL,
 first_name TEXT NOT NULL,
 first_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 second_account_id INTEGER,
 second_employee_id INTEGER,
 second_name TEXT,
 second_at TEXT,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected'))
);`
export function applyV79Migration(db){
 const v=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
 if(v>=79){db.exec(dateSystemReviewSchema);return}
 if(v!==78)throw Error('Schema 78 required')
 db.exec('BEGIN IMMEDIATE')
 try{db.exec(dateSystemReviewSchema);db.exec('INSERT INTO schema_meta(version) VALUES(79);COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
}
