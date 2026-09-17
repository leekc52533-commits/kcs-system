import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {createArea,renameArea} from '../server/createArea.mjs'
const user={id:1,role:'owner_admin',employeeName:'KC'}
function fixture(){const db=new DatabaseSync(':memory:');db.exec(schemaSql);db.exec("PRAGMA foreign_keys=OFF;DELETE FROM zone_groups;INSERT INTO zone_groups(id,code,name,is_active) VALUES(1,'Z1','Kuching',1),(2,'Z2','Old',0);INSERT INTO areas(jodoo_area_id,name,zone_group_id,is_active) VALUES('10095','BATU 4',1,0),('KCS-REF-900-1','Imported Area',1,1)");return db}
test('Area numbers include inactive records, ignore nonnumeric IDs and are allocated with the audit',()=>{const db=fixture();try{const a=createArea(db,user,{name:'  New  Place ',zoneGroupId:1,areaId:'10001'}),b=createArea(db,user,{name:'Another Place',zoneGroupId:1});assert.equal(a.areaId,'10096');assert.equal(b.areaId,'10097');assert.equal(a.name,'New Place');assert.equal(db.prepare('SELECT zone_assignment_status status FROM areas WHERE id=?').get(a.id).status,'confirmed');assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='area_created'").get().n,2);assert.equal(db.prepare("SELECT jodoo_area_id code FROM areas WHERE name='BATU 4'").get().code,'10095')}finally{db.close()}})
test('reject duplicate names, invalid zones and driver access without creating records',()=>{const db=fixture();try{for(const payload of [{name:' batu 4 ',zoneGroupId:1},{name:'New',zoneGroupId:2},{name:'New',zoneGroupId:999},{name:' ',zoneGroupId:1}])assert.throws(()=>createArea(db,user,payload));assert.throws(()=>createArea(db,{role:'driver'},{name:'New',zoneGroupId:1}),{statusCode:403});assert.equal(db.prepare('SELECT COUNT(*) n FROM areas').get().n,2);assert.equal(db.prepare('SELECT COUNT(*) n FROM audit_logs').get().n,0)}finally{db.close()}})
test('an audit failure rolls back the Area and does not consume a number',()=>{const db=fixture();try{db.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'test'); END;");assert.throws(()=>createArea(db,user,{name:'New',zoneGroupId:1}));db.exec('DROP TRIGGER reject_audit');assert.equal(createArea(db,user,{name:'New',zoneGroupId:1}).areaId,'10096')}finally{db.close()}})

test('rename preserves area identity and membership, audits and rejects duplicate/stale/unauthorized edits',()=>{const db=fixture();try{
 const area=db.prepare("SELECT * FROM areas WHERE name='Imported Area'").get(),p={name:'Correct Place',expectedName:area.name,reason:'Spelling correction'}
 assert.throws(()=>renameArea(db,{role:'driver'},area.id,p),{statusCode:403})
 assert.throws(()=>renameArea(db,user,area.id,{...p,name:' batu 4 '}),{statusCode:409})
 const result=renameArea(db,user,area.id,p);assert.deepEqual({...result,name:area.name},{...area})
 assert.equal(db.prepare("SELECT old_value FROM master_change_history WHERE entity_type='area'").get().old_value,area.name)
 assert.throws(()=>renameArea(db,user,area.id,p),{statusCode:409})
 db.exec("CREATE TRIGGER reject_rename BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'test'); END;")
 assert.throws(()=>renameArea(db,user,area.id,{...p,expectedName:result.name,name:'Another Name'}))
 assert.equal(db.prepare('SELECT name FROM areas WHERE id=?').get(area.id).name,result.name)
 }finally{db.close()}})
