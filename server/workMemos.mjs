export const workMemoSchema = `CREATE TABLE IF NOT EXISTS work_memos (
 id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('other','repair','visit')),
 note TEXT NOT NULL, customer TEXT NOT NULL DEFAULT '', due_date TEXT,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 revision INTEGER NOT NULL DEFAULT 1, completed_at TEXT, completed_by TEXT
);`
const fail=(message,statusCode)=>Object.assign(new Error(message),{statusCode})
export function writeMemo(db,id,body,actor){
 if(!body||typeof body!=='object')throw fail('Invalid memo',400)
 if(body.complete===true&&id){
   const res=db.prepare('UPDATE work_memos SET completed_at=CURRENT_TIMESTAMP,completed_by=?,revision=revision+1 WHERE id=? AND revision=? AND completed_at IS NULL').run(actor,id,Number(body.revision))
   if(!res.changes)throw fail('Memo changed. Refresh and try again.',409)
 }else{
   const note=String(body.note??'').trim(), customer=String(body.customer??'').trim(),date=body.due_date||null,kind=body.kind||'other'
   if(!note||note.length>2000||customer.length>200||!['other','repair','visit'].includes(kind))throw fail('Invalid memo details',400)
   if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!db.prepare("SELECT date(?,'+0 days')=? valid").get(date,date).valid))throw fail('Invalid memo date',400)
   if(!id)id=Number(db.prepare('INSERT INTO work_memos(kind,note,customer,due_date,created_by) VALUES(?,?,?,?,?)').run(kind,note,customer,date,actor).lastInsertRowid)
   else if(!db.prepare('UPDATE work_memos SET kind=?,note=?,customer=?,due_date=?,revision=revision+1 WHERE id=? AND revision=? AND completed_at IS NULL').run(kind,note,customer,date,id,Number(body.revision)).changes)throw fail('Memo changed. Refresh and try again.',409)
 }
 return db.prepare('SELECT * FROM work_memos WHERE id=?').get(id)
}
