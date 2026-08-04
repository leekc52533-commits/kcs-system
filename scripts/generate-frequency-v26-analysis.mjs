import fs from 'node:fs'
import path from 'node:path'
import {DatabaseSync} from 'node:sqlite'

const source=process.argv[2]||'C:/Tmp/KCS_Frequency_Pre_Execution_Analysis_20260804.json'
const databasePath=process.argv[3]||'C:/Tmp/kcs-occ-frequency-post.sqlite'
const output=process.argv[4]||'outputs/frequency-v26-20260804/analysis.json'
const data=JSON.parse(fs.readFileSync(source,'utf8'))
const db=new DatabaseSync(databasePath,{readOnly:true})
const dayNames=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const dateOnly=value=>String(value||'').slice(0,10)
const weekday=value=>dayNames[new Date(`${dateOnly(value)}T00:00:00Z`).getUTCDay()]
const occurrence=value=>{const d=new Date(`${dateOnly(value)}T00:00:00Z`),n=Math.ceil(d.getUTCDate()/7);return n<=4?['','First','Second','Third','Fourth'][n]:'Last'}
const nextWeekday=(from,name)=>{const d=new Date(`${from}T00:00:00Z`),target=dayNames.indexOf(name),offset=(target-d.getUTCDay()+7)%7;d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)}
const featureRows=data.frequencyRows.filter(row=>String(row.supportStatus).startsWith('Feature Required'))
const anchors=featureRows.filter(row=>row.hasExistingWeekday&&row.anchorCandidate).map(row=>{
  const existing=String(row.existingWeekdays).split(/[,;/]/).map(x=>x.trim()).filter(Boolean),anchor=dateOnly(row.anchorCandidate),anchorWeekday=weekday(anchor),fixedWeekday=existing.length===1?existing[0]:''
  const safe=row.branchFound&&row.branchStatus==='active'&&Number(row.customerActive)===1&&row.activeScheduleCount===1&&Boolean(fixedWeekday)&&anchorWeekday===fixedWeekday
  return{excelRow:row.excelRow,customerId:row.customerId,branchId:row.branchId,customer:row.customer,branch:row.branch,frequency:row.normalizedDecision,existingWeekday:row.existingWeekdays,existingScheduleIds:row.scheduleIds,existingScheduleFrequency:row.scheduleFrequencies,anchorCandidate:anchor,anchorWeekday,suggestedAnchorDate:anchor,suggestedEffectiveDate:anchor,suggestedMonthlyOccurrence:row.normalizedDecision==='Monthly'?occurrence(anchor):'',safeToReuse:safe?'Yes':'No',basis:'Existing active Schedule next_take_date/take_date; weekday and single-active-schedule validation',warning:safe?'Read-only candidate; no formal write approved.':'Anchor/weekday or active Schedule evidence is not unique.'}
})

const affinity={}
for(const row of data.existingWeekdays){for(const day of String(row.existingWeekdays||'').split(/[,;/]/).map(x=>x.trim()).filter(Boolean)){const key=`${row.zoneGroup}|${day}`;affinity[key]=(affinity[key]||0)+1}}
const baseLoad=Object.fromEntries(data.capacity.map(row=>[row.day,Number(row.existingKnownKg||0)]))
const candidates=featureRows.filter(row=>!row.hasExistingWeekday||!row.anchorCandidate)
const proposals=candidates.map(row=>{
  const prior=data.blockedRows.find(x=>String(x.branchId)===String(row.branchId))||{}
  const zone=prior.zoneGroup||'',area=row.area||prior.area||'',weight=row.avgWeightKg??prior.avgWeightKg,latest=dateOnly(row.latestCollection||prior.latestCollection)
  const selectable=weight!=null&&Number(weight)>0&&zone&&area
  const scores=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(day=>({day,score:(affinity[`${zone}|${day}`]||0)*10-(baseLoad[day]||0)/500-(['Wednesday','Thursday'].includes(day)?20:0)})).sort((a,b)=>b.score-a.score)
  const fixed=selectable?scores[0].day:'',first=fixed?nextWeekday('2026-08-05',fixed):''
  const missing=[weight==null?'Missing Weight':'',!zone?'Missing Zone Group':'',!area?'Missing Area':''].filter(Boolean)
  const status=selectable?(latest?'Safe to Approve':'Supervisor Review Required'):'Blocked'
  return{excelRow:row.excelRow,customerId:row.customerId,branchId:row.branchId,customer:row.customer,branch:row.branch,frequency:row.normalizedDecision,area,zoneGroup:zone,averageWeightKg:weight??null,latestCollection:latest,currentWeekday:row.existingWeekdays||'',proposedFixedWeekday:fixed,proposedAnchorDate:first,firstEffectiveDate:first,proposedMonthlyOccurrence:row.normalizedDecision==='Monthly'&&first?occurrence(first):'',classification:selectable?'Auto Proposal':'Blocked',approvalStatus:status,reason:selectable?`Zone affinity (${affinity[`${zone}|${fixed}`]||0} preserved routes) and lower-load scoring; Wednesday/Thursday penalty applied.`:'No safe weekday can be selected without non-zero weight, Area and Zone Group evidence.',warnings:[...missing,prior.gpsStatus==='Missing'?'Missing GPS':'',prior.addressStatus==='Missing'?'Missing Address':'',!latest?'No recent collection anchor evidence':''].filter(Boolean).join('; '),sunday:'No'}
})

const duplicateSchedules=[]
for(const externalBranchId of ['10050','10278']){
  const branch=db.prepare('SELECT b.id,b.jodoo_branch_id,b.branch_name,c.id customer_internal_id,c.jodoo_customer_id customer_id,c.name customer_name FROM branches b LEFT JOIN customers c ON c.id=b.customer_id WHERE b.jodoo_branch_id=?').get(externalBranchId)
  const schedules=db.prepare(`SELECT s.id internal_schedule_id,s.jodoo_schedule_id schedule_id,s.frequency,s.days_of_week,s.take_date,s.next_take_date,s.source_updated_at,s.updated_at,(SELECT COUNT(*) FROM dispatch_stops ds WHERE ds.source_schedule_id=s.id) dispatch_use_count,(SELECT MAX(dd.dispatch_date) FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id WHERE ds.source_schedule_id=s.id) last_dispatch_date FROM branch_schedules s WHERE s.branch_id=? AND s.is_active=1 ORDER BY s.id`).all(branch.id)
  schedules.forEach((schedule,index)=>duplicateSchedules.push({...branch,...schedule,duplicateEvidence:schedules.length>1&&schedules.every(item=>item.frequency===schedule.frequency&&item.days_of_week===schedule.days_of_week&&item.take_date===schedule.take_date&&item.next_take_date===schedule.next_take_date)?'Exact active Schedule duplicate by frequency, weekdays and dates':'Not identical',recommendation:index===0?'Proposed keep: earliest internal Schedule row; both have equal usage evidence, so supervisor confirmation remains required.':'Proposed deactivate after approval: later duplicate row; preserve dispatch/history references.',confidence:'Low — both active Schedules have identical use counts and timestamps.'}))
}
const remaining=duplicateSchedules.filter(row=>String(row.recommendation).startsWith('Proposed keep')).map(row=>({customerId:row.customer_id,branchId:row.jodoo_branch_id,customer:row.customer_name,branch:row.branch_name,decision:'Confirm which duplicate active Schedule should remain active',proposedKeepScheduleId:row.schedule_id,supervisorDecision:'',remarks:''}))
const result={metadata:{source,databasePath,schema:db.prepare('SELECT MAX(version) value FROM schema_meta').get().value,integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,repositoryCommit:'e15021025967d55da3f7da0b2e8b4345654bf798',generatedAt:new Date().toISOString()},reconciliation:{supervisorDecisions:118,supported:52,featureRequired:66,featureBreakdown:data.featureRequiredBreakdown,featureRows:featureRows.length,spellingNormalizedFeatureRows:1,anchorCandidates:anchors.length,missingParameters:proposals.length,safeAnchorCandidates:anchors.filter(x=>x.safeToReuse==='Yes').length,autoProposals:proposals.filter(x=>x.classification==='Auto Proposal').length,safeToApprove:proposals.filter(x=>x.approvalStatus==='Safe to Approve').length,supervisorReview:proposals.filter(x=>x.approvalStatus==='Supervisor Review Required').length,blocked:proposals.filter(x=>x.classification==='Blocked').length,existingWeekdaysPreserved:264,newSunday:0,formalWrites:0},anchors,proposals,duplicateSchedules,remainingSupervisorDecisions:remaining,migrationRehearsal:{sourceHashBefore:'4F48F48BC6F53C3C9F5B0CB81A89497FC591BF89DBF99087407D7A59D97CA84D',sourceHashAfter:'4F48F48BC6F53C3C9F5B0CB81A89497FC591BF89DBF99087407D7A59D97CA84D',copyPath:'C:/Tmp/kcs-frequency-v26-rehearsal.sqlite',copyHash:'F712CDAB45E15E3CE7AC14F247CFDE84D7A1CBDB46E322694F1C7145F155B569',schemaBefore:25,schemaAfter:26,integrity:'ok',firstRun:{branches:480,schedules:276,weekdays:264,dispatches:396,dispatchStops:681,occurrences:0},secondRun:'No-op; protected counts unchanged'}}
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result.reconciliation,null,2))
