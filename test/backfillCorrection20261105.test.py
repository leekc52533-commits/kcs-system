import importlib.util
import json
import pathlib
import sqlite3
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/correct-backfill-20261105.py'
spec = importlib.util.spec_from_file_location('correction', SCRIPT)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
SCHEMA = subprocess.check_output(['node','--input-type=module','-e',"import {schemaSql} from './server/schema.mjs';process.stdout.write(schemaSql)"],cwd=ROOT,text=True)

class CorrectionTest(unittest.TestCase):
 def setUp(self):
  self.temp = tempfile.TemporaryDirectory();self.path = pathlib.Path(self.temp.name)/'fixture.db'
  self.db = sqlite3.connect(self.path);self.db.row_factory=sqlite3.Row;self.db.executescript(SCHEMA)
  for n,day,q,mills,total in module.SPECS+[(70,18,590,226,13334),(73,1,10,230,230)]:
   company='SK HARDWARE' if n in (87,88) else 'FARLEY'
   branch=company if n in (87,88) else 'FARLEY SAMARAHAN' if n<=72 else 'FARLEY MALL'
   self.db.execute('''INSERT INTO purchase_bills(id,bill_number,branch_id,driver_employee_id,vehicle_id,service_date,customer_name_snapshot,branch_code_snapshot,branch_name_snapshot,driver_name_snapshot,vehicle_code_snapshot,payment_method,weight_method,print_choice,subtotal_cents,total_cents,status,issued_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',(3040+n,f'P261105-{n:03d}',1,1,1,f'2026-10-{day:02d}',company,'B',branch,'D','V','Credit','factory','no_print',total,total,'voided' if n==70 else 'issued','2026-11-05T22:00:00+08:00'))
   self.db.execute('INSERT INTO purchase_bill_items(purchase_bill_id,product_id,product_code_snapshot,product_name_snapshot,unit_snapshot,quantity,unit_price_cents,unit_price_mills,line_total_cents) VALUES(?,1,\'OCC\',\'OCC\',\'kg\',?,?,?,?)',(3040+n,q,round(mills/10),mills,total))
   self.db.execute('INSERT INTO purchase_backfill_audit VALUES(?,1,\'Kc Lee\',\'no bill\',?,?,\'{}\',\'2026-11-05\')',(3040+n,str(n),'hash'))
   self.db.execute('INSERT INTO document_numbers VALUES(?,?,\'P\',\'2026-11-05\',?,\'2026-11-05\')',('purchase-'+str(3040+n),f'P261105-{n:03d}',n))
  self.db.execute("INSERT INTO document_number_sequences VALUES('P','2026-11-05',89)")
  self.db.execute("INSERT INTO document_number_sequences VALUES('P','2026-10-18',11)");self.db.commit()
 def tearDown(self):
  self.db.close();self.temp.cleanup()
 def run_script(self,*args):
  return subprocess.run(['python3',str(SCRIPT),'--db',str(self.path),*args],capture_output=True,text=True)
 def test_preview_apply_and_repeated_apply(self):
  before=[tuple(r) for r in self.db.execute('SELECT * FROM purchase_bills')]
  preview=self.run_script();self.assertEqual(preview.returncode,0,preview.stderr)
  self.assertIn('P261105-072 -> P261018-012',preview.stdout);self.assertIn('P261105-078 -> P261018-013',preview.stdout)
  self.assertIn('Amount difference RM: 1.66',preview.stdout)
  self.assertEqual(before,[tuple(r) for r in self.db.execute('SELECT * FROM purchase_bills')])
  digest=preview.stdout.split('PREVIEW_SHA256: ')[1].splitlines()[0]
  applied=self.run_script('--apply','--expect',digest);self.assertEqual(applied.returncode,0,applied.stderr)
  self.assertEqual(self.db.execute('SELECT total_cents FROM purchase_bills WHERE id=3120').fetchone()[0],19090)
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM kc_backfill_correction_audit').fetchone()[0],21)
  for n in [70,73]:
   self.assertEqual(self.db.execute('SELECT bill_number FROM purchase_bills WHERE id=?',(3040+n,)).fetchone()[0],f'P261105-{n:03d}')
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM document_numbers').fetchone()[0],44)
  self.assertEqual(self.db.execute("SELECT document_number FROM document_numbers WHERE source_key='purchase-3112'").fetchone()[0],'P261018-012')
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE document_numbers SET document_number='BAD'")
  self.db.rollback()
  repeated=self.run_script('--apply','--expect',digest);self.assertNotEqual(repeated.returncode,0)
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM kc_backfill_correction_audit').fetchone()[0],21)
  self.assertTrue(list(self.path.parent.glob('*.bak')))
 def test_stale_preview_and_changed_item_fail_without_changes(self):
  preview=self.run_script();digest=preview.stdout.split('PREVIEW_SHA256: ')[1].splitlines()[0]
  self.db.execute("UPDATE document_number_sequences SET last_sequence=12 WHERE number_date='2026-10-18'");self.db.commit()
  result=self.run_script('--apply','--expect',digest);self.assertNotEqual(result.returncode,0)
  self.assertFalse(module.table_exists(self.db,'kc_backfill_correction_audit'))
  self.assertEqual(self.db.execute('SELECT bill_number FROM purchase_bills WHERE id=3112').fetchone()[0],'P261105-072')
  self.db.execute('UPDATE purchase_bill_items SET quantity=999 WHERE purchase_bill_id=3120');self.db.commit()
  self.assertNotEqual(self.run_script().returncode,0)
 def test_failure_mid_transaction_rolls_back_all_changes_and_restores_trigger(self):
  self.db.execute("CREATE TRIGGER fail_test BEFORE UPDATE ON purchase_bills WHEN OLD.id=3115 BEGIN SELECT RAISE(ABORT,'test failure'); END");self.db.commit()
  preview=self.run_script();digest=preview.stdout.split('PREVIEW_SHA256: ')[1].splitlines()[0]
  result=self.run_script('--apply','--expect',digest);self.assertNotEqual(result.returncode,0)
  self.assertEqual(self.db.execute('SELECT bill_number FROM purchase_bills WHERE id=3107').fetchone()[0],'P261105-067')
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM document_numbers').fetchone()[0],23)
  self.assertFalse(module.table_exists(self.db,'kc_backfill_correction_audit'))
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE document_numbers SET document_number='BAD'")

if __name__=='__main__':unittest.main()
