import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {createZoneGroup} from '../server/resourceService.mjs'
import {businessError} from '../server/businessErrors.mjs'

test('zone creation rejects duplicate active/inactive names and codes without changing records',()=>{
 const db=new DatabaseSync(':memory:');db.exec(schemaSql)
 try{
  const first=createZoneGroup({name:'Test zone',code:'TEST-ZONE'},db)
  for(const active of [1,0]){
   db.prepare('UPDATE zone_groups SET is_active=? WHERE id=?').run(active,first.id)
   const count=db.prepare('SELECT COUNT(*) n FROM audit_logs').get().n
   for(const [payload,code] of [[{name:' Test zone ',code:'ANOTHER'},'ZONE_GROUP_NAME_EXISTS'],[{name:'Another zone',code:'TEST-ZONE'},'ZONE_GROUP_CODE_EXISTS']]){
    assert.throws(()=>createZoneGroup(payload,db),error=>{
     const result=businessError(error);assert.equal(result.errorCode,code);assert.equal(result.status,409)
     for(const language of ['zh','en','ms'])assert.ok(result.messages[language])
     return true
    })
   }
   assert.equal(db.prepare('SELECT COUNT(*) n FROM audit_logs').get().n,count)
   assert.equal(db.prepare('SELECT is_active FROM zone_groups WHERE id=?').get(first.id).is_active,active)
  }
  const second=createZoneGroup({name:'New unique zone'},db)
  assert.notEqual(first.id,second.id)
  assert.equal(second.name,'New unique zone')
 }finally{db.close()}
})
