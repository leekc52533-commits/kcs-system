import {withImmediateTransaction} from './branchServiceDateGuard.mjs'

export function listRoutes(db){
 const rows=db.prepare(`SELECT d.route_number routeNumber,d.display_name name FROM weekly_route_definitions d
 JOIN weekly_route_plans p ON p.id=d.plan_id WHERE p.is_active=1 ORDER BY d.route_number`).all()
 const routes=new Map([1,2,3,4,5].map(routeNumber=>[routeNumber,{routeNumber,name:`Route ${routeNumber}`}]))
 for(const row of rows)routes.set(row.routeNumber,{...row})
 return [...routes.values()].sort((a,b)=>a.routeNumber-b.routeNumber)
}
export const routeNumbers=db=>listRoutes(db).map(r=>r.routeNumber)
export const routeExists=(db,value)=>Number.isSafeInteger(Number(value))&&routeNumbers(db).includes(Number(value))
export function createRoute(db,payload={}){
 const name=String(payload.name||'').trim(),actor=String(payload.changedBy||'Supervisor')
 if(!name||name.length>60)throw Error('ROUTE_NAME_INVALID')
 return withImmediateTransaction(db,()=>{
  if(listRoutes(db).some(r=>r.name.toLowerCase()===name.toLowerCase()))throw Error('ROUTE_NAME_EXISTS')
  let plan=db.prepare('SELECT id FROM weekly_route_plans WHERE is_active=1').get()
  if(!plan){
   plan={id:Number(db.prepare("INSERT INTO weekly_route_plans(name,source_name,created_by) VALUES('Fixed routes','Route management',?)").run(actor).lastInsertRowid)}
   for(let n=1;n<=5;n++)db.prepare('INSERT INTO weekly_route_definitions(plan_id,route_number,display_name,updated_by) VALUES(?,?,?,?)').run(plan.id,n,`Route ${n}`,actor)
  }
  // Never reuse an identifier from an earlier plan or historical dispatch.
  const max=db.prepare('SELECT MAX(n) n FROM (SELECT route_number n FROM weekly_route_definitions UNION ALL SELECT route_number FROM dispatch_stops)').get().n||0
  const routeNumber=Math.max(5,max)+1
  db.prepare('INSERT INTO weekly_route_definitions(plan_id,route_number,display_name,updated_by) VALUES(?,?,?,?)').run(plan.id,routeNumber,name,actor)
  db.prepare("INSERT INTO master_change_history(entity_type,entity_id,change_type,new_value,after_json,reason,changed_by) VALUES('weekly_route_definition',?,'CREATE',?,?,?,?)").run(`${plan.id}:${routeNumber}`,name,JSON.stringify({routeNumber,name}),'New fixed route',actor)
  return{routeNumber,name}
 })
}
