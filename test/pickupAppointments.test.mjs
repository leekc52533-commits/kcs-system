import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
test('dashboard excludes expired pickups and retains today and future reschedules',async()=>{
 const vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
 try{
 const {appointmentList}=await vite.ssrLoadModule('/src/PickupAppointments.jsx')
 const record=(id,date,extra={})=>({id,requestedCollectionDate:date,status:'awaiting_supervisor',...extra})
 const records=[record(1,'2026-12-09'),record(2,'2026-11-11'),record(3,'2026-11-01',{scheduledDate:'2026-11-10',status:'scheduled'}),record(4,'2026-11-08'),record(5,'2026-11-11',{promisedToCustomer:true}),record(6,'2026-11-01',{status:'cancelled'}),record(7,'2026-11-03',{status:'completed'}),record(8,'2026-11-09'),record(9,'2026-11-07',{scheduledDate:'2026-11-08',status:'scheduled'})]
 const list=appointmentList(records,'2026-11-09')
 assert.deepEqual(list.map(x=>x.id),[8,5,2,3,1]);assert.deepEqual(list.filter(x=>x.urgent).map(x=>x.id),[8,5,2]);assert.equal(list.find(x=>x.id===3).planned,true)
 }finally{await vite.close()}
})
