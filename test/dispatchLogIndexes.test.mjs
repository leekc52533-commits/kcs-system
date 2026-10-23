import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'

const indexes=['idx_dispatch_logs_day_type_entity','idx_dispatch_logs_type_id','idx_dispatch_logs_entity_type']
function verify(db){
  const names=db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='dispatch_change_logs'").all().map(r=>r.name)
  for(const name of indexes)assert.ok(names.includes(name),name)
  const queries=[
    ["SELECT 1 FROM dispatch_change_logs WHERE dispatch_day_id=1 AND change_type='support_vehicle_added'",indexes[0]],
    ["SELECT before_json FROM dispatch_change_logs WHERE change_type='route_day_handover' ORDER BY id LIMIT 1",indexes[1]],
    ["SELECT 1 FROM dispatch_change_logs WHERE entity_type='dispatch_stop' AND entity_id='7' AND change_type='route_customer_adjusted'",indexes[2]],
  ]
  for(const [sql,index] of queries){
    const plan=db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all().map(r=>r.detail).join('\n')
    assert.ok(plan.includes('SEARCH')&&plan.includes(index),plan)
  }
}

test('fresh database creates dispatch log lookup indexes',()=>{
  const db=new DatabaseSync(':memory:')
  try{db.exec(schemaSql);verify(db)}finally{db.close()}
})

test('existing unindexed history upgrades without changing records; repeated startup reuses recovery indexes',()=>{
  const db=new DatabaseSync(':memory:')
  try{
    db.exec(schemaSql)
    for(const name of indexes)db.exec(`DROP INDEX ${name}`)
    db.prepare("INSERT INTO dispatch_change_logs(actor,change_type,entity_type,entity_id,before_json,after_json) VALUES(?,?,?,?,?,?)").run('System','route_day_handover','route','1','{"trips":[]}','{"vehicleId":3}')
    const before=db.prepare('SELECT * FROM dispatch_change_logs').all()
    db.exec(schemaSql)
    verify(db)
    const indexRows=db.prepare("SELECT name,rootpage,sql FROM sqlite_master WHERE type='index' AND tbl_name='dispatch_change_logs' ORDER BY name").all()
    db.exec(schemaSql)
    assert.deepEqual(db.prepare("SELECT name,rootpage,sql FROM sqlite_master WHERE type='index' AND tbl_name='dispatch_change_logs' ORDER BY name").all(),indexRows)
    assert.deepEqual(db.prepare('SELECT * FROM dispatch_change_logs').all(),before)
    verify(db)
  }finally{db.close()}
})
