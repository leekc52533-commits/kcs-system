// Merge observed collections into the slots of the same recurring stops. An
// unvisited branch keeps its slot; observing a branch never creates a visit.
export function applyActualCollectionOrder(db,date,routes){
  if(routes.length<2)return
  // Older installations without recorded outcomes cannot provide reliable evidence.
  if(!db.prepare("SELECT 1 FROM pragma_table_info('dispatch_stops') WHERE name='completion_outcome'").get())return
  const groups=new Map()
  for(const row of routes){
    const key=row.routeNumber+':'+row.tripNumber
    if(!groups.has(key))groups.set(key,new Map())
    groups.get(key).set(row.branchId,row)
  }
  // Replay older trips first: a newer run can update the relative order of a
  // subset without erasing what was learned from less frequent customers.
  const history=db.prepare(`SELECT t.id trip,s.route_number route,t.trip_number tripNumber,
      s.branch_id branch,s.completed_at completedAt
    FROM dispatch_days d JOIN dispatch_trips t ON t.dispatch_day_id=d.id
    JOIN dispatch_stops s ON s.dispatch_trip_id=t.id
    JOIN schedule_occurrences o ON o.dispatch_stop_id=s.id AND o.occurrence_source='recurrence'
    WHERE d.dispatch_date<? AND strftime('%w',d.dispatch_date)=strftime('%w',?)
      AND t.execution_status='completed' AND s.status='completed' AND s.completion_outcome='completed'
      AND s.completed_at IS NOT NULL AND s.completed_by_employee_id IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM dispatch_change_logs l WHERE l.dispatch_day_id=d.id AND l.entity_type='dispatch_stop' AND l.entity_id=CAST(s.id AS TEXT) AND l.change_type='prior_credit_collection_confirmed')
      AND s.source_special_request_id IS NULL AND s.route_number IS NOT NULL
    ORDER BY d.dispatch_date,t.id,s.route_number,julianday(s.completed_at),s.id`).all(date,date)
  let batch=[],last=''
  function merge(){
    if(batch.length<2)return
    // Identical timestamps don't prove which visit happened first.
    const slots=batch.map(x=>x.row.stopSequence).sort((a,b)=>a-b)
    if(new Set(batch.map(x=>x.time)).size!==batch.length)return
    batch.forEach(({row},i)=>{row.stopSequence=slots[i]})
  }
  for(const item of history){
    const key=item.trip+':'+item.route
    if(last!==key){merge();batch=[];last=key}
    const row=groups.get(item.route+':'+item.tripNumber)?.get(item.branch)
    if(row)batch.push({row,time:item.completedAt})
  }
  merge()
}
