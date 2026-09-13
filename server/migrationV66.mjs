export const driverGuideSchemaSql=`
CREATE TABLE IF NOT EXISTS employee_guide_reads (
 employee_id INTEGER NOT NULL REFERENCES employees(id),guide_version TEXT NOT NULL,read_at TEXT NOT NULL,
 PRIMARY KEY(employee_id,guide_version)
);
`
export function applyV66Migration(db){
 const v=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
 if(v>=66){db.exec(driverGuideSchemaSql);return}
 if(v!==65)throw Error('Schema 65 required')
 db.exec('BEGIN IMMEDIATE');try{db.exec(driverGuideSchemaSql);db.exec('INSERT INTO schema_meta(version) VALUES(66)');db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
}
