const scheduleKeys=['frequency','weekdays','anchorDate','effectiveDate','monthlyOccurrence','routeNumber','sundayRouteNumber']
const normalized=(key,value)=>key==='weekdays'?[...(value||[])].sort():String(value??'')
export function collectionScheduleChanged(next,current){
 if(!next)return false
 if(!current?.frequency)return true
 return scheduleKeys.some(key=>JSON.stringify(normalized(key,next[key]))!==JSON.stringify(normalized(key,key==='routeNumber'?current.homeRouteNumber??current.routeNumber:current[key])))
}
export function workspaceFieldsChanged(next,current,keys){return keys.some(key=>Object.hasOwn(next||{},key)&&JSON.stringify(next[key]??'')!==JSON.stringify(current?.[key]??''))}
