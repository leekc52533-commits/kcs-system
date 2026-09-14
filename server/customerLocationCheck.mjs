import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto'
import {calculateLocationRecommendation} from './gpsRecommendationService.mjs'
import {reverseGeocodeGoogle} from './googleGeocodingService.mjs'
import {accountCan} from './authService.mjs'
import {updateBranchWithLifecycle} from './customerMasterService.mjs'
const secret=randomBytes(32),sign=s=>createHmac('sha256',secret).update(s).digest('base64url')
const fail=(message,statusCode=409)=>Object.assign(new Error(message),{statusCode})
const text=v=>String(v??'').trim()
const valid=(lat,lng)=>lat!==null&&lat!==undefined&&lat!==''&&lng!==null&&lng!==undefined&&lng!==''&&Number.isFinite(Number(lat))&&Number.isFinite(Number(lng))&&Math.abs(Number(lat))<=90&&Math.abs(Number(lng))<=180&&!(Number(lat)===0&&Number(lng)===0)
export const locationSource=p=>JSON.stringify({branchId:text(p.branchId),customerId:text(p.customerId),address:text(p.branch?.address),areaId:text(p.branch?.areaId),name:text(p.branch?.branchName),gps:p.gps?{latitude:p.gps.latitude,longitude:p.gps.longitude}:null})
function decode(token){try{const [body,sig]=String(token).split('.'),expected=sign(body);if(!sig||sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))throw Error();const data=JSON.parse(Buffer.from(body,'base64url').toString());if(data.expires<Date.now())throw Error();return data}catch{throw fail('Location preview expired or changed. Check again.')}}
export function activeLocationAreas(db){return db.prepare(`SELECT a.id,a.jodoo_area_id areaId,a.name,COALESCE(a.confirmed_zone_group_id,a.zone_group_id) zoneId,z.name zone FROM areas a LEFT JOIN zone_groups z ON z.id=COALESCE(a.confirmed_zone_group_id,a.zone_group_id) WHERE a.is_active=1 AND (z.id IS NULL OR z.is_active=1) ORDER BY a.name`).all()}
export async function previewCustomerLocation(payload,before,actor,db,{geocoder=reverseGeocodeGoogle}={}){
 const official=before.branch&&valid(before.branch.officialLatitude,before.branch.officialLongitude)
 const pending=before.pending?.[0]
 const lat=official?before.branch.officialLatitude:payload.gps?.latitude??pending?.temporaryLatitude
 const lng=official?before.branch.officialLongitude:payload.gps?.longitude??pending?.temporaryLongitude
 const requiresGpsReview=Boolean(before.pending?.length||before.branch&&db.prepare('SELECT 1 FROM branch_gps_history WHERE branch_id=? LIMIT 1').get(before.branch.internalId))
 const areas=activeLocationAreas(db),area=areas.find(a=>text(a.areaId)===text(payload.branch?.areaId))
 let address=null,addressUnavailable=false,recommendation=null
 if(valid(lat,lng)){
  try{const result=await geocoder(Number(lat),Number(lng));address=text(result.address)||null}catch{addressUnavailable=true}
  recommendation=calculateLocationRecommendation({id:before.branch?.internalId||0,latitude:Number(lat),longitude:Number(lng),area_id:area?.id||null,currentZoneGroupId:area?.zoneId||null,branch_name:text(payload.branch?.branchName),address:text(payload.branch?.address)},db)
 }
 const target=areas.find(a=>a.id===recommendation?.recommendedAreaId)
 const source=valid(lat,lng)?{latitude:Number(lat),longitude:Number(lng)}:null
 const proof={actorId:actor.id,branchId:before.branch?.internalId||null,revision:before.revision,source:locationSource(payload),areaParents:areas.map(a=>({areaId:a.areaId,zoneId:a.zoneId})),gps:source,expires:Date.now()+30*60*1000}
 const body=Buffer.from(JSON.stringify(proof)).toString('base64url')
 return {token:body+'.'+sign(body),address,addressUnavailable,areaId:target?.areaId||'',area:target?.name||'',zone:target?.zone||'',confidence:recommendation?.confidence||'none',needsReview:!accountCan(actor,'gps_review',db)||(!official&&(!payload.gps||requiresGpsReview)),gpsSource:official?'official':source?'pending':'missing',conflict:Boolean(recommendation?.boundaryConflict||recommendation?.reason?.conflicts?.length),areas}
}
export function validateLocationCheck(payload,before,actor){if(!payload.locationCheck)return null;const proof=decode(payload.locationCheck.token);if(proof.actorId!==actor.id||proof.branchId!==(before.branch?.internalId||null)||proof.revision!==before.revision||proof.source!==locationSource(payload))throw fail('Location inputs changed. Check again.');return proof}
export function pendingLocationChecks(branchId,db){return db.prepare(`SELECT id,after_json FROM audit_logs r WHERE action='customer_location_requested' AND entity_id=? AND NOT EXISTS(SELECT 1 FROM audit_logs d WHERE d.action='customer_location_decided' AND d.entity_id=CAST(r.id AS TEXT)) ORDER BY id DESC`).all(String(branchId)).map(r=>({id:r.id,...JSON.parse(r.after_json)}))}
const baseOf=b=>({address:text(b.address),areaId:text(b.areaId)})
function applyProposal(branch,proposal,reason,actor,db){
 const areas=activeLocationAreas(db),target=proposal.areaId?areas.find(a=>text(a.areaId)===text(proposal.areaId)):null
 if(proposal.areaId&&(!target||target.zoneId!==proposal.zoneId))throw fail('Area or parent Zone changed. Check again.')
 if(!proposal.gps||!valid(branch.officialLatitude,branch.officialLongitude)||Number(branch.officialLatitude)!==proposal.gps.latitude||Number(branch.officialLongitude)!==proposal.gps.longitude)throw fail('Approve matching GPS first; check again if GPS changed.')
 return updateBranchWithLifecycle(branch.branchId,{address:proposal.address,...proposal.areaId?{areaId:proposal.areaId}:{},reason,changedBy:actor.employeeName||actor.username},{changedBy:actor.employeeName||actor.username,accountId:actor.id},db)
}
export function saveLocationCheck(payload,proof,branch,actor,db){
 if(!proof)return
 if(pendingLocationChecks(branch.internalId,db).length)throw fail('A location review is already pending. Review it first.')
 const areaId=text(payload.locationCheck.areaId),target=activeLocationAreas(db).find(a=>text(a.areaId)===areaId)
 if(areaId&&(!target||!proof.areaParents?.some(a=>text(a.areaId)===areaId&&a.zoneId===target.zoneId)))throw fail('Area or parent Zone changed. Check again.')
 const proposal={address:text(payload.locationCheck.address),areaId,zoneId:target?.zoneId||null,gps:proof.gps,base:baseOf(branch),requestedBy:actor.employeeName||actor.username,reason:payload.reason}
 if(!proposal.address)proposal.address=text(branch.address)
 const id=db.prepare("INSERT INTO audit_logs(action,entity_type,entity_id,after_json) VALUES('customer_location_requested','branch',?,?)").run(String(branch.internalId),JSON.stringify(proposal)).lastInsertRowid
 if(accountCan(actor,'gps_review',db)&&valid(branch.officialLatitude,branch.officialLongitude)){
  applyProposal(branch,proposal,payload.reason,actor,db)
  db.prepare("INSERT INTO audit_logs(action,entity_type,entity_id,after_json) VALUES('customer_location_decided','branch',?,?)").run(String(id),JSON.stringify({decision:'approved',reason:payload.reason,accountId:actor.id}))
 }
}
export function decideCustomerLocation(payload,branch,actor,db){
 if(!accountCan(actor,'gps_review',db))throw fail('Supervisor GPS review permission required.',403)
 if(!['approve','reject'].includes(payload.decision)||!text(payload.reason))throw fail('Decision and reason required.',400)
 const pending=pendingLocationChecks(branch.internalId,db).find(r=>r.id===Number(payload.id));if(!pending)throw fail('Review already decided or not found.')
 if(payload.decision==='approve'){
  if(JSON.stringify(baseOf(branch))!==JSON.stringify(pending.base))throw fail('Branch address or Area changed. Reject and check again.')
  applyProposal(branch,pending,payload.reason,actor,db)
 }
 db.prepare("INSERT INTO audit_logs(action,entity_type,entity_id,after_json) VALUES('customer_location_decided','branch',?,?)").run(String(pending.id),JSON.stringify({decision:payload.decision,reason:payload.reason,accountId:actor.id}))
}
