import {kuchingDate} from '../shared/kuchingTime.js'
// Shared branch history survives changes of assigned driver, vehicle and weekly plan.
export function branchRescheduleHistory(db,branchId,{excludeRequestId=0,now=new Date()}={}){
 const last=db.prepare(`SELECT s.id,s.service_date date,s.completed_at at FROM dispatch_stops s
 WHERE s.branch_id=? AND s.status='completed' AND s.completion_outcome='completed' AND s.completed_at IS NOT NULL
 AND EXISTS(SELECT 1 FROM purchase_bills b WHERE b.dispatch_stop_id=s.id AND b.status='issued')
 ORDER BY julianday(s.completed_at) DESC,s.id DESC LIMIT 1`).get(branchId)
 const rows=db.prepare(`SELECT r.id,r.source_date sourceDate,COALESCE(v.approved_date,r.target_date) targetDate,r.reason,
 r.review_reason reviewReason,r.reviewed_by approvedBy,r.reviewed_at approvedAt,
 e.name employeeName,rr.approval_number approvalNumber,rr.contact_name contactName,rr.contact_at contactAt,rr.contact_result contactResult,
 CASE WHEN rr.proof IS NOT NULL THEN 1 ELSE 0 END hasProof
 FROM driver_date_requests r JOIN dispatch_stops s ON s.id=r.dispatch_stop_id
 LEFT JOIN driver_date_reviews v ON v.request_id=r.id LEFT JOIN employees e ON e.id=r.employee_id
 LEFT JOIN driver_date_repeat_reviews rr ON rr.request_id=r.id
 WHERE s.branch_id=? AND r.status='approved' AND r.id<>?
 AND r.source_date<>COALESCE(v.approved_date,r.target_date)
 AND (? IS NULL OR julianday(r.reviewed_at)>julianday(?)) ORDER BY julianday(r.reviewed_at),r.id`).all(branchId,excludeRequestId,last?.at||null,last?.at||null)
 const visit=db.prepare(`SELECT service_date date,arrived_at at,
 CASE WHEN arrival_captured_at IS NOT NULL AND arrived_by_employee_id IS NOT NULL AND arrival_accuracy_m>0 AND arrival_accuracy_m<=50 AND arrival_distance_m IS NOT NULL AND arrival_distance_m<=150 THEN 1 ELSE 0 END verified
 FROM dispatch_stops WHERE branch_id=? AND status='completed' AND completion_outcome IN ('no_goods','no_goods_notice')
 AND (? IS NULL OR julianday(completed_at)>julianday(?)) ORDER BY julianday(completed_at) DESC,id DESC LIMIT 1`).get(branchId,last?.at||null,last?.at||null)
 const days=last?.date?Math.max(0,Math.floor((Date.parse(kuchingDate(now)+'T00:00:00Z')-Date.parse(last.date+'T00:00:00Z'))/86400000)):null
 return{count:rows.length,lastCollectionDate:last?.date||null,daysSinceCollection:days,lastChange:rows.at(-1)||null,history:rows.slice().reverse(),noGoods:visit?{date:visit.date,verified:Boolean(visit.at&&visit.verified)}:null}
}

export function mobileRescheduleHistory(db,branchId){
 const h=branchRescheduleHistory(db,branchId)
 return{count:h.count,lastCollectionDate:h.lastCollectionDate,daysSinceCollection:h.daysSinceCollection,noGoods:h.noGoods,lastChange:h.lastChange?{sourceDate:h.lastChange.sourceDate,targetDate:h.lastChange.targetDate,reason:h.lastChange.reason}:null}
}
