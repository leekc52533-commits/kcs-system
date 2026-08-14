import {db as defaultDb} from './database.mjs'

export const BRANCH_LIFECYCLE_STATUSES=['ACTIVE','TEMPORARILY_PAUSED','CLOSED','DUPLICATE_REPLACED','NOT_COLLECTING','TEST_INVALID']
const text=value=>String(value??'').trim()
const json=value=>JSON.stringify(value)
const activeSql="COALESCE(b.lifecycle_status,'ACTIVE')='ACTIVE'"

const futureImpact=(database,branchId)=>database.prepare(`SELECT COUNT(*) stopCount,COUNT(DISTINCT d.id) dispatchCount FROM dispatch_stops ds JOIN dispatches d ON d.id=ds.dispatch_id WHERE ds.branch_id=? AND ds.status NOT IN ('completed','cancelled')`).get(branchId)

export function listBranchLifecycleReview(params={},database=defaultDb){
  const where=["COALESCE(b.lifecycle_status,'ACTIVE')<>'ACTIVE'"],args=[],search=text(params.search)
  if(search){const raw=search.replace(/^B/i,''),like=`%${search}%`,rawLike=`%${raw}%`;where.push('(b.jodoo_branch_id LIKE ? OR b.jodoo_branch_id LIKE ? OR b.branch_name LIKE ? OR c.name LIKE ? OR a.name LIKE ? OR b.address LIKE ?)');args.push(like,rawLike,like,like,like,like)}
  if(params.status&&BRANCH_LIFECYCLE_STATUSES.includes(params.status)&&params.status!=='ACTIVE'){where.push('b.lifecycle_status=?');args.push(params.status)}
  if(params.replacement==='with')where.push('b.replaced_by_branch_id IS NOT NULL')
  if(params.replacement==='without')where.push('b.replaced_by_branch_id IS NULL')
  const rows=database.prepare(`SELECT b.id internalId,b.jodoo_branch_id branchId,b.branch_name branchName,c.jodoo_customer_id customerId,c.name customerName,a.name area,b.address,b.lifecycle_status lifecycleStatus,b.status_reason statusReason,b.status_changed_at statusChangedAt,b.status_changed_by statusChangedBy,rb.jodoo_branch_id replacedByBranchId,rb.branch_name replacedByBranchName,(SELECT MAX(ds.completed_at) FROM dispatch_stops ds WHERE ds.branch_id=b.id AND ds.status='completed') lastCollectionDate FROM branches b LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas a ON a.id=b.area_id LEFT JOIN branches rb ON rb.id=b.replaced_by_branch_id WHERE ${where.join(' AND ')} ORDER BY b.status_changed_at DESC,c.name,b.branch_name`).all(...args)
  const counts=Object.fromEntries(BRANCH_LIFECYCLE_STATUSES.filter(status=>status!=='ACTIVE').map(status=>[status,database.prepare('SELECT COUNT(*) n FROM branches WHERE lifecycle_status=?').get(status).n]))
  return{items:rows,counts,total:rows.length}
}

export function listReplacementBranches(params={},database=defaultDb){const search=text(params.search),like=`%${search.replace(/^B/i,'')}%`;return database.prepare(`SELECT b.id internalId,b.jodoo_branch_id branchId,b.branch_name branchName,c.name customerName,a.name area FROM branches b LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas a ON a.id=b.area_id WHERE ${activeSql} AND (?='' OR b.jodoo_branch_id LIKE ? OR b.branch_name LIKE ? OR c.name LIKE ? OR a.name LIKE ?) ORDER BY c.name,b.branch_name LIMIT 100`).all(search,like,`%${search}%`,`%${search}%`,`%${search}%`)}

export function applyBranchLifecycle(branchId,payload={},actor={},database=defaultDb){
  const status=text(payload.lifecycleStatus).toUpperCase(),changedBy=text(actor.changedBy||actor.employeeName)
  if(!BRANCH_LIFECYCLE_STATUSES.includes(status))throw Object.assign(new Error('Invalid Branch lifecycle status'),{statusCode:400})
  const before=database.prepare('SELECT * FROM branches WHERE jodoo_branch_id=?').get(String(branchId));if(!before)throw Object.assign(new Error('Branch not found'),{statusCode:404})
  const previousStatus=before.lifecycle_status||'ACTIVE',requiresReason=status==='TEMPORARILY_PAUSED'||status==='NOT_COLLECTING'||(status==='ACTIVE'&&previousStatus!=='ACTIVE'),reason=status==='CLOSED'?'Closed / No Longer Operating':text(payload.reason)
  if(requiresReason&&!reason)throw Object.assign(new Error(status==='ACTIVE'?'Restore reason is required':'Status change reason is required'),{statusCode:400})
  let replacement=null
  if(status==='DUPLICATE_REPLACED'){
    const replacementId=Number(payload.replacedByBranchId||payload.replacementInternalId)
    if(!replacementId)throw Object.assign(new Error('Replaced By Branch is required'),{statusCode:400})
    if(replacementId===before.id)throw Object.assign(new Error('A Branch cannot replace itself'),{statusCode:400})
    replacement=database.prepare('SELECT id,jodoo_branch_id,branch_name,lifecycle_status,replaced_by_branch_id FROM branches WHERE id=?').get(replacementId)
    if(!replacement)throw Object.assign(new Error('Replacement Branch does not exist'),{statusCode:400})
    if(replacement.lifecycle_status!=='ACTIVE')throw Object.assign(new Error('Select the final active canonical Branch as replacement'),{statusCode:400})
    let cursor=replacement,seen=new Set([before.id]);while(cursor){if(seen.has(cursor.id))throw Object.assign(new Error('Replacement Branch would create a cycle'),{statusCode:400});seen.add(cursor.id);cursor=cursor.replaced_by_branch_id?database.prepare('SELECT id,replaced_by_branch_id FROM branches WHERE id=?').get(cursor.replaced_by_branch_id):null}
  }
  const impact=status==='ACTIVE'?{stopCount:0,dispatchCount:0}:futureImpact(database,before.id),legacy=status==='ACTIVE'?{status:'active',isActive:1}:status==='CLOSED'?{status:'closed',isActive:0}:{status:'paused',isActive:0}
  const oldReplacement=before.replaced_by_branch_id?database.prepare('SELECT jodoo_branch_id,branch_name FROM branches WHERE id=?').get(before.replaced_by_branch_id):null
  database.prepare('UPDATE branches SET lifecycle_status=?,status_reason=?,status_changed_at=CURRENT_TIMESTAMP,status_changed_by=?,replaced_by_branch_id=?,status=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status,reason||null,changedBy||'Authenticated User',replacement?.id||null,legacy.status,legacy.isActive,before.id)
  const after=database.prepare('SELECT * FROM branches WHERE id=?').get(before.id)
  database.prepare(`INSERT INTO master_change_history(entity_type,entity_id,change_type,field_name,old_value,new_value,before_json,after_json,reason,changed_by) VALUES('branch',?,'lifecycle_status_changed','lifecycle_status',?,?,?,?,?,?)`).run(before.jodoo_branch_id,previousStatus,status,json({lifecycleStatus:previousStatus,replacedByBranchId:oldReplacement?.jodoo_branch_id||null,replacedByBranchName:oldReplacement?.branch_name||null}),json({lifecycleStatus:status,replacedByBranchId:replacement?.jodoo_branch_id||null,replacedByBranchName:replacement?.branch_name||null}),reason||null,changedBy||'Authenticated User')
  return{branchId:before.jodoo_branch_id,lifecycleStatus:status,statusReason:reason,statusChangedAt:after.status_changed_at,statusChangedBy:after.status_changed_by,replacedBy:replacement&&{internalId:replacement.id,branchId:replacement.jodoo_branch_id,branchName:replacement.branch_name},impact:{futureDispatches:Number(impact.dispatchCount||0),futureStops:Number(impact.stopCount||0)},warnings:Number(impact.stopCount||0)>0?[`${impact.stopCount} future or unfinished Stop(s) remain unchanged.`]:[]}
}

export function changeBranchLifecycle(branchId,payload={},actor={},database=defaultDb){
  if(database.isTransaction)return applyBranchLifecycle(branchId,payload,actor,database)
  database.exec('BEGIN IMMEDIATE')
  try{const result=applyBranchLifecycle(branchId,payload,actor,database);database.exec('COMMIT');return result}catch(error){database.exec('ROLLBACK');throw error}
}
