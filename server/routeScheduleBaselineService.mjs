import {routeScheduleProposals} from './routeSchedulePlanning.mjs'
import {getCollectionScheduleManagement,saveCollectionScheduleManagement} from './collectionScheduleManagementService.mjs'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'
export function synchronizeRouteScheduleBaseline(database,{today=kuchingDate(),dryRun=false}={}){
 const proposals=routeScheduleProposals(database,today),automatic=proposals.filter(p=>p.automatic),pending=proposals.filter(p=>!p.automatic)
 if(dryRun)return{dryRun:true,automatic,pending}
 return withImmediateTransaction(database,()=>{
  let applied=0
  for(const item of automatic){
   const current=getCollectionScheduleManagement(item.internalBranchId,database)
   if(!current)throw new Error(`Route schedule Branch ${item.branchId} (internal ID ${item.internalBranchId}) is no longer active or could not be resolved; synchronization rolled back.`)
   saveCollectionScheduleManagement(item.internalBranchId,{...item.proposal,expectedUpdatedAt:current.updatedAt,reason:'Synchronize approved uploaded Route weekdays',changedBy:'System route baseline'},database)
   applied++
  }
  return{applied,pending}
 })
}
