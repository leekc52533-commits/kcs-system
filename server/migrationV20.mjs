export const V20_VERSION=20

const columns=database=>new Set(database.prepare('PRAGMA table_info(employees)').all().map(row=>row.name))

export function ensureV20EmployeeColumns(database){
  const existing=columns(database)
  if(!existing.has('driving_licence_expiry_date'))database.exec('ALTER TABLE employees ADD COLUMN driving_licence_expiry_date TEXT')
  if(!existing.has('gdl_expiry_date'))database.exec('ALTER TABLE employees ADD COLUMN gdl_expiry_date TEXT')
}

export function applyV20Migration(database){
  const version=Number(database.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>V20_VERSION)return{schemaVersion:version,columnsAdded:0}
  const before=columns(database)
  database.exec('BEGIN IMMEDIATE')
  try{
    ensureV20EmployeeColumns(database)
    database.prepare('INSERT OR IGNORE INTO schema_meta(version) VALUES(?)').run(V20_VERSION)
    database.exec('COMMIT')
    return{schemaVersion:V20_VERSION,columnsAdded:Number(!before.has('driving_licence_expiry_date'))+Number(!before.has('gdl_expiry_date'))}
  }catch(error){database.exec('ROLLBACK');throw error}
}
