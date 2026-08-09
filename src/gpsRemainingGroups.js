const compareText=(left,right)=>String(left||'').localeCompare(String(right||''),undefined,{sensitivity:'base'})

export function groupRemainingGpsByArea(items=[],unassignedLabel='Unassigned Area'){
  const groups=new Map()
  for(const item of items){
    const hasArea=item.areaId!=null||Boolean(item.area)
    const hasZone=item.zoneGroupId!=null||Boolean(item.zoneGroup)
    const key=hasArea?`area:${item.areaId??item.area}`:hasZone?`zone:${item.zoneGroupId??item.zoneGroup}`:'unassigned'
    if(!groups.has(key))groups.set(key,{key,label:item.area||item.zoneGroup||unassignedLabel,zoneGroup:item.area?item.zoneGroup||'':'',zoneSortOrder:Number.isFinite(Number(item.zoneSortOrder))?Number(item.zoneSortOrder):Number.MAX_SAFE_INTEGER,unassigned:!hasArea&&!hasZone,items:[]})
    groups.get(key).items.push(item)
  }
  return [...groups.values()]
    .map(group=>({...group,items:group.items.slice().sort((left,right)=>compareText(left.branchName,right.branchName)||compareText(left.customerName,right.customerName)||Number(left.internalId)-Number(right.internalId))}))
    .sort((left,right)=>Number(left.unassigned)-Number(right.unassigned)||left.zoneSortOrder-right.zoneSortOrder||compareText(left.label,right.label)||compareText(left.key,right.key))
}
