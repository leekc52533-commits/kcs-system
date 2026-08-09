import test from 'node:test'
import assert from 'node:assert/strict'
import {groupRemainingGpsByArea} from '../src/gpsRemainingGroups.js'

const branch=(internalId,branchName,extra={})=>({internalId,branchId:`B${internalId}`,branchName,customerName:`Customer ${internalId}`,...extra})

test('remaining GPS Branches group by Area in Zone business order without omissions or duplicates',()=>{
  const items=[branch(4,'Zulu'),branch(2,'Beta',{areaId:20,area:'Batu Kawa',zoneGroupId:2,zoneGroup:'Kuching B',zoneSortOrder:2}),branch(1,'Alpha',{areaId:20,area:'Batu Kawa',zoneGroupId:2,zoneGroup:'Kuching B',zoneSortOrder:2}),branch(3,'Samarahan',{areaId:30,area:'Samarahan',zoneGroupId:1,zoneGroup:'Samarahan A',zoneSortOrder:1})]
  const groups=groupRemainingGpsByArea(items,'Unassigned Area')
  assert.deepEqual(groups.map(group=>[group.label,group.items.length]),[['Samarahan',1],['Batu Kawa',2],['Unassigned Area',1]])
  assert.deepEqual(groups[1].items.map(item=>item.branchName),['Alpha','Beta'])
  assert.deepEqual(groups.flatMap(group=>group.items).map(item=>item.internalId).sort((a,b)=>a-b),[1,2,3,4])
})

test('Zone is a stable fallback only when no Area assignment exists',()=>{
  const groups=groupRemainingGpsByArea([branch(1,'One',{zoneGroupId:7,zoneGroup:'Lundu / Bau',zoneSortOrder:7}),branch(2,'Two',{zoneGroupId:7,zoneGroup:'Lundu / Bau',zoneSortOrder:7})])
  assert.equal(groups.length,1)
  assert.equal(groups[0].label,'Lundu / Bau')
  assert.equal(groups[0].items.length,2)
})
