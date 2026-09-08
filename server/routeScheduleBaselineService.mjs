import {routeScheduleProposals} from './routeSchedulePlanning.mjs'
import {getCollectionScheduleManagement,saveCollectionScheduleManagement} from './collectionScheduleManagementService.mjs'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'
export function synchronizeRouteScheduleBaseline(database,{today=kuchingDate(),dryRun=false}={}){
 const proposals=routeScheduleProposals(database,today),automatic=proposals.filter(p=>p.automatic),pending=proposals.filter(p=>!p.automatic)
 if(dryRun)return{dryRun:true,automatic,pending}
 return withImmediateTransaction(database,()=>{
  let applied=0
  for(const item of automatic){const current=getCollectionScheduleManagement(item.branchId,database);saveCollectionScheduleManagement(item.branchId,{...item.proposal,expectedUpdatedAt:current.updatedAt,reason:'Synchronize approved uploaded Route weekdays',changedBy:'System route baseline'},database);applied++}
  return{applied,pending}
 })
}
