import {KCS_WEEKLY_ROUTE_PLAN_ARRANGE} from './weeklyRoutePlanArrangeData.mjs'
import {KCS_WEEKLY_ROUTE_PLAN_V49} from './weeklyRoutePlanV49Data.mjs'
import {ROUTE_NUMBER_BY_LEGACY_PLATE} from './weeklyRoutePlanService.mjs'
const key=value=>String(value??'').trim().toUpperCase().replace(/^B(?=\d)/,'')
export function uploadedRouteEvidence(branchCode){
 return [KCS_WEEKLY_ROUTE_PLAN_ARRANGE,KCS_WEEKLY_ROUTE_PLAN_V49].map(plan=>({source:plan.sourceName,rows:plan.entries.filter(r=>key(r[4])===key(branchCode)).map(r=>({weekday:r[0],routeNumber:ROUTE_NUMBER_BY_LEGACY_PLATE[r[1]],sequence:r[3]}))})).filter(item=>item.rows.length)
}
export function existingRouteEvidence(db,branch){
 const uploaded=uploadedRouteEvidence(branch.jodoo_branch_id)
 const recorded=db.prepare("SELECT DISTINCT ds.route_number routeNumber,dd.dispatch_date date FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id WHERE ds.branch_id=? AND ds.route_number IS NOT NULL AND ds.status<>'cancelled' ORDER BY dd.dispatch_date DESC LIMIT 14").all(branch.id)
 return {uploaded,recorded,message:uploaded.length?'曾在上传路线表中出现，请核对是否恢复；不会自动覆盖当前安排':recorded.length?'有历史派车 ROUTE，尚未保存为固定路线；请确认长期归属':'现行及已保存的上传路线表均未找到此客户，需确认固定归属'}
}
