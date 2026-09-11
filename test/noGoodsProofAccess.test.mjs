import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {isNoGoodsPhotoPath,noGoodsProofForViewer} from '../server/noGoodsProofAccess.mjs'
import fs from 'node:fs'
test('No Goods photo gate allows task driver, uploader and assigned crew only',()=>{
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE driver_no_goods_proofs(id,storage_key,content_type,driver_employee_id,dispatch_trip_id);CREATE TABLE dispatch_trips(id,dispatch_id,dispatch_day_id);CREATE TABLE dispatches(id,driver_id,assistant_id,vehicle_id);CREATE TABLE dispatch_vehicle_assistants(dispatch_day_id,vehicle_id,employee_id);INSERT INTO driver_no_goods_proofs VALUES(1,'proof.jpg','image/jpeg',10,20);INSERT INTO dispatch_trips VALUES(20,30,40);INSERT INTO dispatches VALUES(30,11,12,50);INSERT INTO dispatch_vehicle_assistants VALUES(40,50,13),(41,50,14),(40,51,15);`)
 for(const employeeId of [10,11,12,13])assert.equal(noGoodsProofForViewer(db,1,{employeeId,role:'driver'}).storage_key,'proof.jpg')
 for(const employeeId of [0,14,15,99])assert.throws(()=>noGoodsProofForViewer(db,1,{employeeId,role:'driver'}),e=>e.statusCode===403)
 assert.equal(noGoodsProofForViewer(db,999,{employeeId:10,role:'driver'}),null)
 assert.equal(isNoGoodsPhotoPath('/api/driver-no-goods/1/photo'),true)
 for(const url of ['/api/driver-no-goods/1/restore','/api/purchase-bills/proofs/1','/api/cash-floats/proofs/1'])assert.equal(isNoGoodsPhotoPath(url),false)
 const source=fs.readFileSync(new URL('../server/index.mjs',import.meta.url),'utf8');assert.match(source,/if\(isNoGoodsPhotoPath\(pathname\)\)return'mobile'/)
 db.close()
})
