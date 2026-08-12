import {db as defaultDb} from './database.mjs'
import {reverseGeocodeGoogle} from './googleGeocodingService.mjs'

const text=value=>String(value??'').trim()
const normalizeName=value=>text(value).toLowerCase().replace(/\bjln\b/g,'jalan').replace(/\blrg\b/g,'lorong').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim().replace(/^(jalan|lorong)\s+/,'')
const displayName=value=>text(value).replace(/^jln\b/i,'Jalan').replace(/^lrg\b/i,'Lorong')
const hasGps=row=>Number.isFinite(row.latitude)&&Number.isFinite(row.longitude)&&!(row.latitude===0&&row.longitude===0)
const actor=value=>text(value)||'KCS User'
const round=value=>Math.round(Number(value)*1e7)/1e7

function distanceKm(a,b){const rad=Math.PI/180,dLat=(b.latitude-a.latitude)*rad,dLon=(b.longitude-a.longitude)*rad,lat1=a.latitude*rad,lat2=b.latitude*rad,x=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function candidateName(result){return displayName(result.road||result.street||result.sublocality||result.locality||result.city||'')}

async function concurrentMap(items,limit,mapper){const output=new Array(items.length);let cursor=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(cursor<items.length){const index=cursor++;output[index]=await mapper(items[index],index)}}));return output}

function branchRows(areaId,includeExisting,database){
  const childIds=database.prepare('SELECT child_area_id id FROM area_refinement_children WHERE parent_area_id=?').all(areaId).map(row=>row.id)
  const ids=includeExisting?[areaId,...childIds]:[areaId],marks=ids.map(()=>'?').join(',')
  return database.prepare(`SELECT b.id,b.jodoo_branch_id branchId,b.branch_name branchName,b.address,b.latitude,b.longitude,b.area_id currentAreaId,a.name currentAreaName,c.jodoo_customer_id customerId,c.name customerName FROM branches b LEFT JOIN areas a ON a.id=b.area_id LEFT JOIN customers c ON c.id=b.customer_id WHERE b.is_active=1 AND b.area_id IN (${marks}) ORDER BY COALESCE(b.branch_name,''),b.id`).all(...ids)
}

function applyGrouping(items){
  const grouped=new Map()
  for(const item of items.filter(row=>row.action==='move')){const key=normalizeName(item.proposedAreaName);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(item)}
  const stable=[...grouped.values()].filter(group=>group.length>=2)
  for(const group of grouped.values()){
    if(group.length>=2){const confidence=group.length>=3?'high':'medium',canonical=[...new Set(group.map(item=>item.proposedAreaName))].sort((a,b)=>(/^Jalan\b/i.test(b)?1:0)-(/^Jalan\b/i.test(a)?1:0)||a.localeCompare(b))[0];for(const item of group){item.proposedAreaName=canonical;item.confidence=confidence;item.reason=`${group.length} official GPS records share the normalized road/locality “${canonical}”.`};continue}
    const item=group[0],near=stable.map(candidate=>({candidate,distance:Math.min(...candidate.map(row=>distanceKm(item,row)))})).filter(row=>row.distance<=1.5).sort((a,b)=>a.distance-b.distance)[0]
    if(near){item.proposedAreaName=near.candidate[0].proposedAreaName;item.confidence='medium';item.reason=`Sparse GPS point merged with the nearest stable road/locality group (${near.distance.toFixed(2)} km).`}
    else{item.action='needs_review';item.confidence='needs_review';item.reason='Only one usable GPS point supports this subdivision; manual review is required to avoid over-splitting.'}
  }
  return items
}

export async function analyzeArea(areaId,{includeExisting=false,createdBy,geocoder=reverseGeocodeGoogle}={},database=defaultDb){
  const area=database.prepare('SELECT id,name,zone_group_id zoneGroupId,confirmed_zone_group_id confirmedZoneGroupId,zone_assignment_status zoneAssignmentStatus FROM areas WHERE id=? AND is_active=1').get(Number(areaId))
  if(!area)throw Object.assign(new Error('Area not found'),{statusCode:404})
  const branches=branchRows(area.id,Boolean(includeExisting),database),official=branches.filter(hasGps)
  const analysis=database.prepare('INSERT INTO area_refinement_analyses(parent_area_id,include_existing,created_by) VALUES(?,?,?)').run(area.id,includeExisting?1:0,actor(createdBy)),analysisId=Number(analysis.lastInsertRowid)
  try{
    const geocoded=await concurrentMap(official,4,async branch=>{try{const found=await geocoder(branch.latitude,branch.longitude),name=candidateName(found);return{...branch,geocode:found,proposedAreaName:name,action:name?'move':'needs_review',confidence:'needs_review',reason:name?'GPS address requires grouping validation.':'Google returned no usable road or locality; manual review is required.'}}catch(error){return{...branch,geocode:{},proposedAreaName:'',action:'needs_review',confidence:'needs_review',reason:`Reverse geocoding unavailable: ${text(error.message)||'unknown error'}`}}})
    const suggestions=applyGrouping([...geocoded,...branches.filter(branch=>!hasGps(branch)).map(branch=>({...branch,geocode:{},proposedAreaName:'',action:'need_gps',confidence:'needs_review',reason:'Official GPS is required before Area refinement.'}))])
    const insert=database.prepare('INSERT INTO area_refinement_suggestions(analysis_id,branch_id,current_area_id,proposed_area_name,action,confidence,reason,official_latitude,official_longitude,reverse_address,road,locality,sublocality,postal_code) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    database.exec('BEGIN IMMEDIATE')
    try{for(const item of suggestions)insert.run(analysisId,item.id,item.currentAreaId,item.proposedAreaName||null,item.action,item.confidence,item.reason,hasGps(item)?item.latitude:null,hasGps(item)?item.longitude:null,item.geocode.address||null,item.geocode.street||null,item.geocode.locality||item.geocode.city||null,item.geocode.sublocality||null,item.geocode.postalCode||null);database.exec('COMMIT')}catch(error){database.exec('ROLLBACK');throw error}
    return getAreaRefinement(analysisId,database)
  }catch(error){database.prepare("UPDATE area_refinement_analyses SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(analysisId);throw error}
}

export function getAreaRefinement(analysisId,database=defaultDb){
  const analysis=database.prepare(`SELECT ar.id,ar.parent_area_id parentAreaId,a.name parentAreaName,ar.status,ar.include_existing includeExisting,ar.created_by createdBy,ar.created_at createdAt,ar.updated_by updatedBy,ar.updated_at updatedAt,ar.confirmed_by confirmedBy,ar.confirmed_at confirmedAt,ar.reason,z.name zoneGroup FROM area_refinement_analyses ar JOIN areas a ON a.id=ar.parent_area_id LEFT JOIN zone_groups z ON z.id=COALESCE(a.confirmed_zone_group_id,a.zone_group_id) WHERE ar.id=?`).get(Number(analysisId))
  if(!analysis)throw Object.assign(new Error('Area refinement analysis not found'),{statusCode:404})
  const items=database.prepare(`SELECT s.id,s.branch_id branchInternalId,b.jodoo_branch_id branchId,b.branch_name branchName,c.jodoo_customer_id customerId,c.name customerName,s.current_area_id currentAreaId,a.name currentAreaName,s.proposed_area_name proposedAreaName,s.action,s.confidence,s.reason,s.official_latitude latitude,s.official_longitude longitude,s.reverse_address reverseAddress,s.road,s.locality,s.sublocality,s.postal_code postalCode,b.address currentAddress FROM area_refinement_suggestions s JOIN branches b ON b.id=s.branch_id LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas a ON a.id=s.current_area_id WHERE s.analysis_id=? ORDER BY CASE s.action WHEN 'move' THEN 1 WHEN 'keep' THEN 2 WHEN 'needs_review' THEN 3 ELSE 4 END,COALESCE(s.proposed_area_name,''),COALESCE(b.branch_name,''),b.id`).all(analysis.id)
  const uniqueNames=new Set(items.filter(item=>item.action==='move'&&text(item.proposedAreaName)).map(item=>normalizeName(item.proposedAreaName)))
  const existingChildren=database.prepare('SELECT a.name FROM area_refinement_children c JOIN areas a ON a.id=c.child_area_id WHERE c.parent_area_id=?').all(analysis.parentAreaId).map(row=>normalizeName(row.name))
  const counts={total:items.length,officialGps:items.filter(item=>Number.isFinite(item.latitude)&&Number.isFinite(item.longitude)).length,needGps:items.filter(item=>item.action==='need_gps').length,move:items.filter(item=>item.action==='move').length,keep:items.filter(item=>item.action==='keep').length,needsReview:items.filter(item=>item.action==='needs_review').length,createAreas:[...uniqueNames].filter(name=>!existingChildren.includes(name)).length}
  return{...analysis,includeExisting:Boolean(analysis.includeExisting),counts,items}
}

export function updateAreaRefinement(analysisId,{items=[],changedBy}={},database=defaultDb){
  const analysis=database.prepare("SELECT id,status FROM area_refinement_analyses WHERE id=?").get(Number(analysisId));if(!analysis)throw Object.assign(new Error('Area refinement analysis not found'),{statusCode:404});if(analysis.status!=='preview')throw new Error('Only a Preview analysis can be adjusted')
  if(!Array.isArray(items)||!items.length)throw new Error('At least one Branch adjustment is required')
  const allowed=new Set(['move','keep','needs_review','need_gps']),update=database.prepare('UPDATE area_refinement_suggestions SET proposed_area_name=?,action=?,confidence=?,reason=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE analysis_id=? AND branch_id=?')
  database.exec('BEGIN IMMEDIATE');try{for(const item of items){const action=text(item.action);if(!allowed.has(action))throw new Error('Invalid Area refinement action');const name=text(item.proposedAreaName);if(action==='move'&&!name)throw new Error('Suggested Area name is required when moving a Branch');const result=update.run(name||null,action,'needs_review',text(item.reason)||'Manually adjusted during Preview.',actor(changedBy),analysis.id,Number(item.branchId));if(result.changes!==1)throw new Error('Branch does not belong to this Area refinement analysis')}database.prepare('UPDATE area_refinement_analyses SET updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(actor(changedBy),analysis.id);database.exec('COMMIT');return getAreaRefinement(analysis.id,database)}catch(error){database.exec('ROLLBACK');throw error}
}

export function confirmAreaRefinement(analysisId,{reason,changedBy,failBeforeAudit=false}={},database=defaultDb){
  const preview=getAreaRefinement(analysisId,database),why=text(reason);if(preview.status!=='preview')throw new Error('Only a Preview analysis can be confirmed');if(!why)throw new Error('Confirmation reason is required');if(preview.counts.needsReview)throw new Error('Resolve every Needs Review suggestion before confirmation')
  const who=actor(changedBy),movable=preview.items.filter(item=>item.action==='move'),created=[],moved=[]
  database.exec('BEGIN IMMEDIATE')
  try{
    const parent=database.prepare('SELECT * FROM areas WHERE id=?').get(preview.parentAreaId),childRows=database.prepare('SELECT c.child_area_id id,a.name FROM area_refinement_children c JOIN areas a ON a.id=c.child_area_id WHERE c.parent_area_id=?').all(parent.id),children=new Map(childRows.map(row=>[normalizeName(row.name),row.id]))
    const names=[...new Map(movable.map(item=>[normalizeName(item.proposedAreaName),item.proposedAreaName])).entries()]
    names.forEach(([key,name],index)=>{if(children.has(key))return;const externalId=`KCS-REF-${preview.id}-${index+1}`,result=database.prepare(`INSERT INTO areas(jodoo_area_id,name,zone_group_id,confirmed_zone_group_id,zone_assignment_status,zone_confirmed_by,zone_confirmed_at,is_active) VALUES(?,?,?,?, 'confirmed',?,CURRENT_TIMESTAMP,1)`).run(externalId,name,parent.zone_group_id,parent.confirmed_zone_group_id??parent.zone_group_id,who),childId=Number(result.lastInsertRowid);database.prepare('INSERT INTO area_refinement_children(parent_area_id,child_area_id,analysis_id) VALUES(?,?,?)').run(parent.id,childId,preview.id);children.set(key,childId);created.push(childId)})
    for(const item of movable){const live=database.prepare('SELECT area_id,latitude,longitude FROM branches WHERE id=?').get(item.branchInternalId);if(!live||live.area_id!==item.currentAreaId||round(live.latitude)!==round(item.latitude)||round(live.longitude)!==round(item.longitude))throw new Error(`Branch ${item.branchId} changed after Preview; run Analyze again`);const target=children.get(normalizeName(item.proposedAreaName));database.prepare('UPDATE branches SET area_id=?,source_area_id=(SELECT jodoo_area_id FROM areas WHERE id=?),updated_at=CURRENT_TIMESTAMP WHERE id=?').run(target,target,item.branchInternalId);moved.push({branchId:item.branchInternalId,beforeAreaId:item.currentAreaId,afterAreaId:target})}
    if(failBeforeAudit)throw new Error('Simulated Area refinement audit failure')
    for(const change of moved)database.prepare(`INSERT INTO master_change_history(entity_type,entity_id,change_type,field_name,before_json,after_json,reason,changed_by) VALUES('branch',?,'area_refinement_confirmed','area_id',?,?,?,?)`).run(String(change.branchId),JSON.stringify({areaId:change.beforeAreaId}),JSON.stringify({areaId:change.afterAreaId}),why,who)
    database.prepare(`INSERT INTO master_change_history(entity_type,entity_id,change_type,field_name,before_json,after_json,reason,changed_by) VALUES('area_refinement',?,'area_refinement_confirmed','status',?,?,?,?)`).run(String(preview.id),JSON.stringify({status:'preview',parentAreaId:preview.parentAreaId}),JSON.stringify({status:'confirmed',parentAreaId:preview.parentAreaId,createdAreaIds:created,branchesMoved:moved,officialGpsUsed:movable.map(item=>({branchId:item.branchInternalId,latitude:item.latitude,longitude:item.longitude})),analysisSource:'Customer Branch Official GPS + Google Reverse Geocoding'}),why,who)
    database.prepare("UPDATE area_refinement_analyses SET status='confirmed',confirmed_by=?,confirmed_at=CURRENT_TIMESTAMP,updated_by=?,updated_at=CURRENT_TIMESTAMP,reason=? WHERE id=?").run(who,who,why,preview.id)
    database.exec('COMMIT');return{...getAreaRefinement(preview.id,database),result:{createdAreaIds:created,movedBranchCount:moved.length}}
  }catch(error){database.exec('ROLLBACK');throw error}
}
