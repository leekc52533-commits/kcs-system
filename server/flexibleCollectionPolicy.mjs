import {kuchingDate} from '../shared/kuchingTime.js'
// Route settings are company-wide and have no expiry. Never fall back to legacy zone switches.
export function routeCollectionOpen(db,routeNumber){return Boolean(db.prepare('SELECT 1 FROM route_collection_access WHERE route_number=? AND is_open=1').get(Number(routeNumber)))}
export function branchCollectionRoutes(db,branchId,date=kuchingDate()){
 const stops=db.prepare(`SELECT DISTINCT COALESCE(f.source_route_number,s.route_number) route FROM dispatch_stops s LEFT JOIN flexible_collection_claims f ON f.stop_id=s.id JOIN dispatch_trips t ON t.id=s.dispatch_trip_id JOIN dispatch_days d ON d.id=t.dispatch_day_id WHERE s.branch_id=? AND d.dispatch_date=? AND s.status<>'cancelled' AND COALESCE(f.source_route_number,s.route_number) IS NOT NULL`).all(Number(branchId),date)
 const routes=stops.length?stops:db.prepare(`SELECT DISTINCT s.route_number route FROM weekly_route_plan_stops s JOIN weekly_route_plans p ON p.id=s.plan_id AND p.is_active=1 WHERE s.branch_id=?`).all(Number(branchId))
 // Ambiguous unscheduled customers require all their mapped routes to be open.
 return routes.map(r=>r.route).filter(Boolean)
}
export function branchCollectionOpen(db,branchId,date=kuchingDate()){const routes=branchCollectionRoutes(db,branchId,date);return routes.length>0&&routes.every(r=>routeCollectionOpen(db,r))}
export function stopCollectionOpen(db,stopId){
 const s=db.prepare('SELECT s.branch_id,COALESCE(f.source_route_number,s.route_number) route_number,d.dispatch_date FROM dispatch_stops s LEFT JOIN flexible_collection_claims f ON f.stop_id=s.id JOIN dispatch_trips t ON t.id=s.dispatch_trip_id JOIN dispatch_days d ON d.id=t.dispatch_day_id WHERE s.id=?').get(Number(stopId));return Boolean(s&&(s.route_number?routeCollectionOpen(db,s.route_number):branchCollectionOpen(db,s.branch_id,s.dispatch_date)))
}
export function flexibleExecution(db,stopId){
 if(stopCollectionOpen(db,stopId))return true
 return Boolean(db.prepare('SELECT 1 FROM flexible_collection_claims f JOIN dispatch_stops s ON s.id=f.stop_id WHERE s.id=? AND s.arrived_at IS NOT NULL').get(Number(stopId)))
}
