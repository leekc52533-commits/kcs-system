const hasColumn=(database,table,column)=>database.prepare(`PRAGMA table_info(${table})`).all().some(item=>item.name===column)

export function applyV17Migration(database){
  const currentVersion=Number(database.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(currentVersion>=17)return false
  database.exec('BEGIN IMMEDIATE')
  try{
    if(!hasColumn(database,'auth_accounts','system_role'))database.exec('ALTER TABLE auth_accounts ADD COLUMN system_role TEXT')
    if(!hasColumn(database,'auth_accounts','preferred_language'))database.exec("ALTER TABLE auth_accounts ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'en'")
    database.exec(`
      CREATE TABLE IF NOT EXISTS auth_account_change_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_account_id INTEGER NOT NULL REFERENCES auth_accounts(id),
        field_name TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_by_account_id INTEGER REFERENCES auth_accounts(id),
        changed_by TEXT NOT NULL,
        changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      UPDATE auth_accounts SET
        system_role=CASE
          WHEN lower(username)='kcadmin' THEN 'owner_admin'
          WHEN role='admin' THEN 'operations_admin'
          WHEN role IN ('supervisor','office','driver','crew') THEN role
          ELSE 'office'
        END
      WHERE system_role IS NULL OR TRIM(system_role)='' OR system_role NOT IN ('owner_admin','operations_admin','supervisor','office','driver','crew');
      UPDATE auth_accounts
      SET system_role='owner_admin',role='admin'
      WHERE lower(username)='kcadmin';
      UPDATE auth_accounts SET preferred_language=CASE
        WHEN lower(username)='kcadmin' THEN 'zh'
        WHEN employee_id IN (SELECT id FROM employees WHERE job_role IN ('Driver','Attendant / Crew','Assistant','Crew')) THEN 'ms'
        ELSE 'en'
      END
      WHERE lower(username)='kcadmin'
        OR employee_id IN (SELECT id FROM employees WHERE job_role IN ('Driver','Attendant / Crew','Assistant','Crew'))
        OR preferred_language IS NULL OR preferred_language NOT IN ('ms','zh','en');
    `)
    database.prepare('INSERT OR IGNORE INTO schema_meta(version) VALUES(17)').run()
    database.exec('COMMIT')
  }catch(error){
    database.exec('ROLLBACK')
    throw error
  }
  const integrity=database.prepare('PRAGMA integrity_check').get().integrity_check
  if(integrity!=='ok')throw new Error(`Database integrity check failed after v17 migration: ${integrity}`)
  return true
}
