import {normalizePlate} from './weeklyRoutePlanService.mjs'

export const ROUTE_PLATES={L2:'QAA4293N',L3:'QAB1225B',L4:'QM3028M',L5:'QTY5028',L6:'QM630S'}
export const USER_CONFIRMED_OVERRIDES=new Map([
  ...'B10151 B10142 B10164 B10104 B10134 B10135 B10167 B10145 B10177 B10144 B10275 B10310'.split(' ').map(branch=>[`0:${branch}`,ROUTE_PLATES.L5]),
  ...'B10123 B10125 B10140 B10141 B10048 B10149 B10147 B10148'.split(' ').map(branch=>[`0:${branch}`,ROUTE_PLATES.L6]),
  ['1:B10426',ROUTE_PLATES.L5],['1:B10289',ROUTE_PLATES.L5],['3:B10198',ROUTE_PLATES.L5]
])

export const USER_CONFIRMED_MOVES=[
  ['1:B10242','2:B10242'],['1:B10373','2:B10373'],['1:B10438','2:B10438'],
  ['4:B10071','3:B10071'],['4:B10058','3:B10058'],['4:B10320','3:B10320'],
  ['4:B10049','3:B10049'],['4:B10113','3:B10113'],['4:B10074','3:B10074']
]
export const USER_CONFIRMED_ADDITIONS=new Set(['0:B10204','2:B10137','5:B10137','2:B10498','5:B10498','2:B10499','5:B10499'])
const normalizedBranchCode=value=>{const code=String(value??'').trim().toUpperCase().replace(/\s+/g,'');return /^\d+$/.test(code)?`B${code}`:code}
const branchAliases=value=>{const code=normalizedBranchCode(value);return [code,/^B\d+$/.test(code)?code.slice(1):code]}
const key=(weekday,branchCode)=>`${weekday}:${normalizedBranchCode(branchCode)}`
const snapshot=(db,table)=>JSON.stringify(db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())
const protectedTables=['dispatch_days','dispatches','dispatch_trips','dispatch_stops','stop_step_records','stop_documents','purchase_bills','purchase_payment_proofs','unloading_weight_records','cash_float_transactions','admin_expense_records']

export function reconcileRouteRows(canonical,candidates,{confirmed=true}={}){
  const byKey=new Map()
  for(const raw of candidates){
    if(raw.heading)continue
    const item={...raw,plate:normalizePlate(raw.plate),branchCode:normalizedBranchCode(raw.branchCode)}
    const k=key(item.weekday,item.branchCode),list=byKey.get(k)||[]
    if(!list.some(x=>x.plate===item.plate&&x.sequence===item.sequence))list.push(item)
    byKey.set(k,list)
  }
  const canonicalKeys=new Set(canonical.map(x=>key(x.weekday,x.branchCode))),report={conflicts:[],omissions:[],extras:[],changes:[],moves:[],additions:[]}
  const confirmedMoves=confirmed?USER_CONFIRMED_MOVES:[],confirmedAdditions=confirmed?USER_CONFIRMED_ADDITIONS:new Set(),moveBySource=new Map(confirmedMoves),moveDestinations=new Set(confirmedMoves.map(x=>x[1]))
  const rows=canonical.map(original=>{
    const sourceKey=key(original.weekday,original.branchCode),destinationKey=moveBySource.get(sourceKey)
    if(destinationKey&&!canonicalKeys.has(destinationKey)){
      const destinationChoices=byKey.get(destinationKey)||[],chosen=destinationChoices.find(x=>x.plate===ROUTE_PLATES.L6)
      if(!chosen)throw new Error(`Confirmed move candidate missing: ${destinationKey}`)
      const moved={...original,weekday:chosen.weekday,plate:chosen.plate,sequence:chosen.sequence}
      report.moves.push({stopId:original.stopId,from:sourceKey,to:destinationKey,plate:chosen.plate,sequence:chosen.sequence})
      return moved
    }
    const k=key(original.weekday,original.branchCode),choices=byKey.get(k)||[]
    let chosen
    if(choices.length===1)chosen=choices[0]
    else if(choices.length>1){
      const overridePlate=USER_CONFIRMED_OVERRIDES.get(k)
      chosen=overridePlate?choices.find(x=>x.plate===overridePlate):choices.find(x=>x.plate===normalizePlate(original.plate))
      report.conflicts.push({key:k,candidates:choices.map(x=>({plate:x.plate,sequence:x.sequence})),resolution:overridePlate?'user-confirmed-override':chosen?'canonical-vehicle-candidate':'canonical-original',finalPlate:chosen?.plate||normalizePlate(original.plate),finalSequence:chosen?.sequence||original.sequence})
    }else report.omissions.push({key:k,plate:original.plate,sequence:original.sequence})
    if(original.plate===ROUTE_PLATES.L4)chosen=undefined
    if(chosen&&(chosen.plate!==normalizePlate(original.plate)||chosen.sequence!==original.sequence))report.changes.push({key:k,from:{plate:original.plate,sequence:original.sequence},to:{plate:chosen.plate,sequence:chosen.sequence}})
    return chosen?{...original,plate:chosen.plate,sequence:chosen.sequence}:original
  })
  const resultKeys=new Set(rows.map(x=>key(x.weekday,x.branchCode)))
  for(const additionKey of confirmedAdditions)if(!resultKeys.has(additionKey)){
    const chosen=(byKey.get(additionKey)||[])[0];if(!chosen)throw new Error(`Confirmed addition candidate missing: ${additionKey}`)
    const template=canonical.find(x=>normalizedBranchCode(x.branchCode)===normalizedBranchCode(chosen.branchCode))
    rows.push({...chosen,stopId:null,branchId:template?.branchId||null,zoneName:null,areaName:null})
    report.additions.push({key:additionKey,plate:chosen.plate,sequence:chosen.sequence})
  }
  for(const [k,choices] of byKey)if(!canonicalKeys.has(k)&&!moveDestinations.has(k)&&!confirmedAdditions.has(k))for(const choice of choices)report.extras.push({key:k,plate:choice.plate,sequence:choice.sequence})
  report.sequenceAdjustments=[]
  for(const weekday of [0,1,2,3,4,5,6])for(const plate of Object.values(ROUTE_PLATES)){
    const group=rows.filter(x=>x.weekday===weekday&&x.plate===plate).sort((a,b)=>a.branchCode.localeCompare(b.branchCode)),used=new Set()
    for(const row of group){let sequence=row.sequence;while(used.has(`${row.trip}:${sequence}`))sequence++;if(sequence!==row.sequence){report.sequenceAdjustments.push({key:key(row.weekday,row.branchCode),from:row.sequence,to:sequence});row.sequence=sequence}used.add(`${row.trip}:${sequence}`)}
  }
  return{rows,report}
}

function assertFinal(rows){
  if(rows.length!==698)throw new Error(`Confirmed route count must be 698; found ${rows.length}`)
  const existingIds=rows.filter(x=>x.stopId).map(x=>x.stopId);if(new Set(existingIds).size!==existingIds.length)throw new Error('Existing Stop IDs are not unique')
  if(new Set(rows.map(x=>key(x.weekday,x.branchCode))).size!==698)throw new Error('Canonical branch/weekday keys are not unique')
  if(rows.some(x=>!x.branchCode||!x.plate||!Number.isInteger(x.sequence)||x.sequence<1))throw new Error('Required route field is missing')
  if(rows.filter(x=>x.plate===ROUTE_PLATES.L4).length!==137)throw new Error('L4 must remain exactly 137 stops')
  if(new Set(rows.map(x=>`${x.weekday}:${x.plate}:${x.trip}:${x.sequence}`)).size!==698)throw new Error('Final route positions are not unique')
  if(rows.some(x=>x.plate==='QAV3468'))throw new Error('Standby vehicle QAV3468 has a formal route')
}

export function applyWeeklyRoutePlanV50(candidates,{apply=false}={},db){
  const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version!==50)throw new Error(`Schema v50 is required; current schema is v${version}`)
  const plan=db.prepare('SELECT id FROM weekly_route_plans WHERE is_active=1').get();if(!plan)throw new Error('Active v49 weekly route plan not found')
  const canonical=db.prepare(`SELECT s.rowid stopId,s.branch_id branchId,s.weekday,b.jodoo_branch_id branchCode,s.vehicle_registration_number plate,s.trip_number trip,s.stop_sequence sequence,s.zone_name_snapshot zoneName,s.area_name_snapshot areaName FROM weekly_route_plan_stops s JOIN branches b ON b.id=s.branch_id WHERE s.plan_id=? ORDER BY s.rowid`).all(plan.id)
  const beforeProtected=Object.fromEntries(protectedTables.map(t=>[t,snapshot(db,t)])),beforeRoutes=snapshot(db,'weekly_route_plan_stops')
  const {rows,report}=reconcileRouteRows(canonical,candidates);assertFinal(rows)
  db.exec('BEGIN IMMEDIATE')
  try{
    const originalById=new Map(canonical.map(x=>[x.stopId,x])),changedRows=rows.filter(row=>row.stopId&&(['weekday','plate','sequence'].some(field=>row[field]!==originalById.get(row.stopId)?.[field])))
    let changed=changedRows.length,inserted=rows.filter(row=>!row.stopId).length,moved=report.moves.length
    if(changed){
      const park=db.prepare('UPDATE weekly_route_plan_stops SET stop_sequence=stop_sequence+10000 WHERE plan_id=?')
      park.run(plan.id)
      const update=db.prepare('UPDATE weekly_route_plan_stops SET weekday=?,vehicle_registration_number=?,stop_sequence=? WHERE rowid=?')
      for(const row of rows)if(row.stopId)update.run(row.weekday,row.plate,row.sequence,row.stopId)
    }
    if(inserted){
      const findBranches=db.prepare("SELECT id FROM branches WHERE UPPER(REPLACE(jodoo_branch_id,' ','')) IN (?,?)"),insert=db.prepare('INSERT INTO weekly_route_plan_stops(plan_id,weekday,branch_id,vehicle_registration_number,trip_number,stop_sequence,zone_name_snapshot,area_name_snapshot) VALUES(?,?,?,?,?,?,?,?)')
      for(const row of rows)if(!row.stopId){const matches=row.branchId?[]:findBranches.all(...branchAliases(row.branchCode)),branchId=row.branchId||(matches.length===1?matches[0].id:null);if(!branchId)throw new Error(matches.length>1?`Confirmed addition Branch ID is ambiguous: ${row.branchCode}`:`Confirmed addition Branch ID missing: ${row.branchCode}`);insert.run(plan.id,row.weekday,branchId,row.plate,row.trip,row.sequence,row.zoneName,row.areaName)}
    }
    if(Object.entries(beforeProtected).some(([t,value])=>snapshot(db,t)!==value))throw new Error('Protected non-route data changed')
    if(db.prepare('PRAGMA foreign_key_check').get())throw new Error('Foreign-key validation failed')
    if(apply)db.exec('COMMIT');else db.exec('ROLLBACK')
    return{mode:apply?'apply':'dry-run',noOp:changed===0&&inserted===0,changed,inserted,moved,routeCount:rows.length,report,beforeRoutesUnchanged:!apply&&snapshot(db,'weekly_route_plan_stops')===beforeRoutes}
  }catch(error){db.exec('ROLLBACK');throw error}
}
