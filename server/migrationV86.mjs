// Rebuild only tables carrying the old five-route CHECK, retaining their actual
// deployed columns, keys, indexes, triggers and AUTOINCREMENT high-water marks.
const routeLimit=/CHECK\(\s*((?:home_|sunday_)?route_number)\s+BETWEEN\s+1\s+AND\s+5\s*\)/gi
const quote=name=>'"'+name.replaceAll('"','""')+'"'
export function applyV86Migration(db){
 const version=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
 if(version>=86)return{noOp:true}
 if(version!==85)throw Error('Schema 85 required')
 const foreignKeys=db.prepare('PRAGMA foreign_keys').get().foreign_keys
 const legacy=db.prepare('PRAGMA legacy_alter_table').get().legacy_alter_table
 const beforeViolations=new Set(db.prepare('PRAGMA foreign_key_check').all().map(row=>JSON.stringify(row)))
 db.exec('PRAGMA foreign_keys=OFF;PRAGMA legacy_alter_table=ON;BEGIN IMMEDIATE')
 try{
  const tables=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL ORDER BY name").all()
  const rebuilt=[]
  for(const table of tables){
   const sql=table.sql.replace(routeLimit,'CHECK($1 >= 1)')
   if(sql===table.sql)continue
   const temp=`__route86_${table.name}`,name=quote(table.name)
   const dependents=db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL").all(table.name)
   const sequence=db.prepare('SELECT seq FROM sqlite_sequence WHERE name=?').get(table.name)?.seq
   const columns=db.prepare(`PRAGMA table_xinfo(${name})`).all().filter(c=>c.hidden===0).map(c=>quote(c.name)).join(',')
   const count=db.prepare(`SELECT COUNT(*) n FROM ${name}`).get().n
   db.exec(sql.replace(/^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|\w+)/i,`CREATE TABLE ${quote(temp)}`))
   db.exec(`INSERT INTO ${quote(temp)}(${columns}) SELECT ${columns} FROM ${name}`)
   if(db.prepare(`SELECT COUNT(*) n FROM ${quote(temp)}`).get().n!==count)throw Error(`Route migration row count mismatch: ${table.name}`)
   db.exec(`DROP TABLE ${name};ALTER TABLE ${quote(temp)} RENAME TO ${name}`)
   for(const item of dependents)db.exec(item.sql)
   if(sequence!=null)db.prepare('UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name=?').run(sequence,table.name)
   rebuilt.push(table.name)
  }
  const newViolations=db.prepare('PRAGMA foreign_key_check').all().filter(row=>!beforeViolations.has(JSON.stringify(row)))
  if(newViolations.length)throw Error('Route migration introduced foreign-key violations')
  db.exec('INSERT INTO schema_meta(version) VALUES(86);COMMIT')
  return{schemaVersion:86,rebuilt}
 }catch(error){db.exec('ROLLBACK');throw error}
 finally{db.exec(`PRAGMA legacy_alter_table=${legacy};PRAGMA foreign_keys=${foreignKeys}`)}
}
