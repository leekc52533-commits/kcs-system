import test from 'node:test'
import assert from 'node:assert/strict'
import {upcomingLeave,leaveDaysUntil} from '../shared/upcomingLeave.js'
test('seven day reminder includes boundary and ongoing leave but not rejected, ended or distant leave',()=>{
 const row=(id,start_date,end_date,status='approved')=>({id,name:'A',start_date,end_date,status})
 const records=[row(1,'2026-10-06','2026-10-06'),row(2,'2026-10-07','2026-10-07'),row(3,'2026-09-28','2026-09-30'),row(4,'2026-09-29','2026-09-29','pending'),row(5,'2026-09-29','2026-09-29','rejected'),row(6,'2026-09-28','2026-09-28')]
 assert.deepEqual(upcomingLeave(records,new Date('2026-09-28T16:00:00Z')).map(r=>r.id),[3,4,1])
 assert.deepEqual(upcomingLeave([],new Date('2026-09-28T16:00:00Z')),[])
})

test('countdown uses Kuching calendar dates across midnight and month boundaries',()=>{
 assert.equal(leaveDaysUntil('2026-10-01',new Date('2026-09-29T02:56:00Z')),2)
 assert.equal(leaveDaysUntil('2026-10-01',new Date('2026-09-30T15:59:59Z')),1)
 assert.equal(leaveDaysUntil('2026-10-01',new Date('2026-09-30T16:00:00Z')),0)
 assert.equal(leaveDaysUntil('2026-10-01',new Date('2026-10-01T16:00:00Z')),-1)
})
