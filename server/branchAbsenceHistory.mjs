// Absence is a confirmed missed visit, not a synonym for rescheduling.
// Match only known, unambiguous legacy reasons; never infer no contact from
// missing GPS, missing bills, an overdue schedule or arbitrary free text.
const normalize=value=>String(value||'').trim().toLowerCase().replace(/[。.!！]+$/u,'').replace(/\s+/g,' ')
const legacyTime=new Set(['时间不足，来不及收货','来不及','来不及收货','tak sempat','not enough time'].map(normalize))
const legacyUncontacted=new Set(['未到店且未联系客户','没有到店也没有联系客户','belum pergi dan belum hubungi pelanggan','not visited and customer not contacted'].map(normalize))
export function absenceReason(row){
 if(row.arrivedAt||row.hasBill||row.hasNoGoods||['no_goods','no_goods_notice','completed'].includes(row.outcome))return null
 let evidence={}
 try{evidence=JSON.parse(row.evidenceJson||'{}')||{}}catch{return null}
 if(evidence.position||evidence.contactMethod==='onsite')return null
 if(row.reasonCode)return ['time','uncontacted'].includes(row.reasonCode)?row.reasonCode:null
 const reason=normalize(row.reason)
 return legacyTime.has(reason)?'time':legacyUncontacted.has(reason)?'uncontacted':null
}

export function branchAbsenceHistory(db,branchId){
 // The issued purchase bill is the collection evidence; use its business date,
 // including standalone bills, not a planned date or later approval timestamp.
 const last=db.prepare("SELECT service_date date,bill_number number FROM purchase_bills WHERE branch_id=? AND status='issued' ORDER BY service_date DESC,id DESC LIMIT 1").get(branchId)
 const rows=db.prepare(`SELECT r.id,r.dispatch_stop_id stopId,r.source_date sourceDate,
 COALESCE(v.approved_date,r.target_date) targetDate,r.reason,r.review_reason reviewReason,
 r.reviewed_by approvedBy,r.reviewed_at approvedAt,e.name employeeName,
 s.arrived_at arrivedAt,s.completion_outcome outcome,
 x.reason_code reasonCode,x.details_json evidenceJson,
 EXISTS(SELECT 1 FROM purchase_bills b WHERE b.dispatch_stop_id=s.id AND b.status='issued') hasBill,
 EXISTS(SELECT 1 FROM no_goods_notices n WHERE n.dispatch_stop_id=s.id AND n.restored_at IS NULL) hasNoGoods
 FROM driver_date_requests r JOIN dispatch_stops s ON s.id=r.dispatch_stop_id
 LEFT JOIN driver_date_reviews v ON v.request_id=r.id LEFT JOIN employees e ON e.id=r.employee_id
 LEFT JOIN driver_date_evidence x ON x.request_id=r.id
 WHERE s.branch_id=? AND r.status='approved' AND r.source_date<>COALESCE(v.approved_date,r.target_date)
 AND (? IS NULL OR r.source_date>?) ORDER BY r.source_date DESC,r.id DESC`).all(branchId,last?.date||null,last?.date||null)
 const seen=new Set(),history=[]
 for(const row of rows){
  const category=absenceReason(row),key=`${row.stopId}:${row.sourceDate}`
  if(!category||seen.has(key))continue
  seen.add(key)
  const {id,sourceDate,targetDate,reason,employeeName,approvedBy,approvedAt,reviewReason}=row
  history.push({id,sourceDate,targetDate,reason,employeeName,approvedBy,approvedAt,reviewReason,category})
 }
 return {count:history.length,history,lastCollectionDate:last?.date||null,lastBillNumber:last?.number||null}
}
