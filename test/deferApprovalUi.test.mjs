import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

test('driver return time, locked-next status and supervisor approval controls are wired',()=>{const mobile=readFileSync(new URL('../src/AuthPages.jsx',import.meta.url),'utf8'),planner=readFileSync(new URL('../src/WeeklyDispatchPage.jsx',import.meta.url),'utf8'),api=readFileSync(new URL('../server/index.mjs',import.meta.url),'utf8');assert.match(mobile,/type="time"/);assert.match(mobile,/expectedReturnTime:deferTimes/);assert.match(mobile,/deferApprovalStatus==='pending'/);assert.match(mobile,/nextCustomerLocked/);assert.match(mobile,/setInterval\(\(\)=>refresh/);assert.match(planner,/DeferApprovalPanel/);assert.match(planner,/defer-requests\/\$\{item\.id\}\/\$\{decision\}/);assert.match(planner,/canApproveDefer/);assert.match(api,/canApproveDriverDefer/);assert.match(api,/decideDeferRequest/)})
