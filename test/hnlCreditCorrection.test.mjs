import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {correctHnlCredit} from '../scripts/correct-hnl-credit-20260921.mjs'
function fixture(ledger=true){const db=new DatabaseSync(':memory:');db.exec(`
CREATE TABLE purchase_bills(id INTEGER PRIMARY KEY,bill_number,status,total_cents,service_date,dispatch_stop_id,branch_name_snapshot,branch_id,driver_employee_id,payment_method,updated_at);
CREATE TABLE dispatch_stops(id INTEGER PRIMARY KEY,branch_id,status,payment_status,completed_at);
CREATE TABLE branches(id INTEGER PRIMARY KEY,jodoo_branch_id);
CREATE TABLE audit_logs(id INTEGER PRIMARY KEY,action,entity_type,entity_id,before_json,after_json);
CREATE TABLE cash_float_transactions(id INTEGER PRIMARY KEY,employee_id,transaction_type,amount_cents,service_date,purchase_bill_id UNIQUE,reversed_transaction_id,payment_channel,description,reference_number,created_by_name_snapshot,created_at,voided_at);
CREATE TABLE purchase_payment_proofs(purchase_bill_id);
CREATE TABLE purchase_bill_void_requests(purchase_bill_id,status);
CREATE TABLE cash_float_accounts(employee_id,is_active,low_balance_threshold_cents);
CREATE TABLE cash_float_alerts(employee_id,balance_cents,last_checked_at,status,resolved_at);
INSERT INTO purchase_bills VALUES(1,'P260921-008','issued',2700,'2026-09-21',5032,'Hnl bbs',5,8,'Cash',NULL);
INSERT INTO dispatch_stops VALUES(5032,5,'active','pending_proof',NULL);
INSERT INTO branches VALUES(5,'B10509');
INSERT INTO cash_float_accounts VALUES(8,1,-1000);
INSERT INTO cash_float_alerts VALUES(8,-2700,NULL,'active',NULL);
`);if(ledger)db.exec("INSERT INTO cash_float_transactions(id,employee_id,transaction_type,amount_cents,purchase_bill_id) VALUES(1,8,'cash_purchase',-2700,1)");return db}
test('preview is unchanged; apply preserves identity and completion, reverses deduction once, audits and repeats safely',()=>{const db=fixture();try{
 const original=db.prepare('SELECT * FROM purchase_bills').get();correctHnlCredit(db);assert.deepEqual(db.prepare('SELECT * FROM purchase_bills').get(),original);assert.equal(db.prepare('SELECT COUNT(*) n FROM cash_float_transactions').get().n,1)
 const r=correctHnlCredit(db,{apply:true});assert.equal(r.cashFloatReversedRM,27);assert.equal(r.stopStatus,'active');assert.equal(db.prepare('SELECT completed_at FROM dispatch_stops').get().completed_at,null)
 assert.equal(db.prepare('SELECT SUM(amount_cents) n FROM cash_float_transactions').get().n,0);assert.equal(db.prepare('SELECT status FROM cash_float_alerts').get().status,'resolved');assert.equal(db.prepare('SELECT payment_method FROM purchase_bills').get().payment_method,'Credit')
 assert.equal(correctHnlCredit(db,{apply:true}).alreadyCorrected,true);assert.equal(db.prepare('SELECT COUNT(*) n FROM audit_logs').get().n,1)
 const before=JSON.parse(db.prepare('SELECT before_json FROM audit_logs').get().before_json);assert.deepEqual(before.bill,{...original})
 }finally{db.close()}})
test('no original deduction means no invented refund',()=>{const db=fixture(false);try{assert.equal(correctHnlCredit(db,{apply:true}).cashFloatReversedRM,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM cash_float_transactions').get().n,0);assert.equal(correctHnlCredit(db,{apply:true}).alreadyCorrected,true)}finally{db.close()}})
for(const [label,sql] of [['proof','INSERT INTO purchase_payment_proofs VALUES(1)'],['wrong amount','UPDATE purchase_bills SET total_cents=2800'],['wrong ledger','UPDATE cash_float_transactions SET amount_cents=-2600'],['void',"INSERT INTO purchase_bill_void_requests VALUES(1,'pending')"]])test(label+' aborts atomically',()=>{const db=fixture();try{db.exec(sql);assert.throws(()=>correctHnlCredit(db,{apply:true}));assert.equal(db.prepare('SELECT payment_method FROM purchase_bills').get().payment_method,'Cash');assert.equal(db.prepare('SELECT COUNT(*) n FROM audit_logs').get().n,0)}finally{db.close()}})
