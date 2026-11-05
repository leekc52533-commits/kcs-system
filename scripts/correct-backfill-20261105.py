"""One-time, reviewed KC correction. Default is read-only preview."""
import argparse
import datetime
import hashlib
import json
import pathlib
import re
import sqlite3
from decimal import Decimal, ROUND_HALF_UP

BATCH = 'kc-backfill-20261105'
# Old suffix, actual October day, quantity, expected mills, expected total cents.
SPECS = [(67,1,640,230,14720),(68,11,580,230,13340),(69,14,650,230,14950),
 (71,29,620,230,14260),(72,18,590,230,13570),(74,6,670,230,15410),
 (75,7,770,230,17710),(76,16,610,230,14030),(77,17,830,230,19090),
 (78,18,900,230,20700),(79,19,920,230,21160),(80,20,830,228,18924),
 (81,24,720,230,16560),(82,27,820,230,18860),(83,28,650,230,14950),
 (84,29,920,230,21160),(85,30,660,230,15180),(86,31,970,230,22310),
 (87,22,710,190,13490),(88,26,640,190,12160),(89,21,680,230,15640)]

def require(condition, message):
    if not condition:
        raise RuntimeError(message)

def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))

def table_exists(db, name):
    return db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone() is not None

def plan(db):
    if table_exists(db, 'kc_backfill_correction_audit'):
        done = db.execute('SELECT COUNT(*) FROM kc_backfill_correction_audit WHERE batch=?', (BATCH,)).fetchone()[0]
        require(done == 0, f'This correction already has {done} audit records. Do not run again.')
    all_numbers = [r[0] for r in db.execute("SELECT bill_number FROM purchase_bills UNION SELECT document_number FROM document_numbers WHERE prefix='P'")]
    maxima = dict(db.execute("SELECT number_date,last_sequence FROM document_number_sequences WHERE prefix='P'").fetchall())
    for number in all_numbers:
        m = re.fullmatch(r'P(\d{6}|\d{8})-(\d+)', number)
        if m:
            digits = ('20' if len(m[1]) == 6 else '') + m[1]
            date = f'{digits[:4]}-{digits[4:6]}-{digits[6:]}'
            maxima[date] = max(maxima.get(date, 0), int(m[2]))
    result = []
    for suffix, day, quantity, mills, total in SPECS:
        old = f'P261105-{suffix:03d}'
        b = db.execute('SELECT * FROM purchase_bills WHERE bill_number=?', (old,)).fetchone()
        require(b is not None, f'Missing {old}')
        b = dict(b)
        company = 'SK HARDWARE' if suffix in (87,88) else 'FARLEY'
        branch = company if suffix in (87,88) else 'FARLEY SAMARAHAN' if suffix <= 72 else 'FARLEY MALL'
        date = f'2026-10-{day:02d}'
        require(b['id'] == 3040+suffix and b['service_date'] == date and b['customer_name_snapshot'] == company and b['branch_name_snapshot'] == branch, f'Identity changed: {old}')
        require(b['status'] == 'issued' and b['payment_method'] == 'Credit', f'Not an issued credit bill: {old}')
        require(all(b.get(k) is None for k in ('dispatch_stop_id','dispatch_trip_id','dispatch_day_id')), f'Linked dispatch: {old}')
        a = db.execute('SELECT * FROM purchase_backfill_audit WHERE purchase_bill_id=?', (b['id'],)).fetchone()
        require(a is not None and a['operator_name'] == 'Kc Lee', f'Not the expected admin backfill: {old}')
        require(not db.execute('SELECT 1 FROM cash_float_transactions WHERE purchase_bill_id=?', (b['id'],)).fetchone(), f'Cash ledger linked: {old}')
        items = [dict(r) for r in db.execute('SELECT * FROM purchase_bill_items WHERE purchase_bill_id=? ORDER BY id', (b['id'],))]
        require(len(items) == 1, f'Unexpected item count: {old}')
        item = items[0]
        require(item['product_name_snapshot'] == 'OCC' and item['unit_snapshot'] == 'kg' and Decimal(str(item['quantity'])) == quantity, f'Item changed: {old}')
        require(item['unit_price_mills'] == mills and item['line_total_cents'] == total and b['total_cents'] == total and b['subtotal_cents'] == total, f'Amounts changed: {old}')
        d = db.execute('SELECT * FROM document_numbers WHERE source_key=?', ('purchase-'+str(b['id']),)).fetchone()
        require(d is not None and d['document_number'] == old, f'Number registry mismatch: {old}')
        target_mills = 190 if company == 'SK HARDWARE' else 230
        target_total = int((Decimal(str(item['quantity']))*target_mills/10).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
        maxima[date] = maxima.get(date,0)+1
        number = 'P'+date.replace('-','')[2:]+'-'+str(maxima[date]).zfill(3)
        result.append(dict(old=old,new=number,date=date,sequence=maxima[date],price_mills=target_mills,total_cents=target_total,bill=b,items=items,registry=dict(d),backfill=dict(a)))
    return result

def apply(db, rows, backup_path):
    triggers = db.execute("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name='document_numbers'").fetchall()
    require({r['name'] for r in triggers} == {'document_numbers_no_update','document_numbers_no_delete'}, 'Unexpected number registry protections; stop for review.')
    db.execute('''CREATE TABLE IF NOT EXISTS kc_backfill_correction_audit(
        batch TEXT NOT NULL,bill_id INTEGER NOT NULL,old_number TEXT NOT NULL,new_number TEXT NOT NULL,
        before_json TEXT NOT NULL,after_json TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,
        backup_path TEXT NOT NULL,PRIMARY KEY(batch,bill_id))''')
    # Preserve every original number permanently under a historical source key.
    # Only source_key changes; restore the registry protection in this transaction.
    db.execute('DROP TRIGGER document_numbers_no_update')
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    for row in rows:
        b = row['bill']; key = 'purchase-'+str(b['id'])
        db.execute('UPDATE document_numbers SET source_key=? WHERE source_key=?', (BATCH+'-original-'+key,key))
        db.execute('INSERT INTO document_numbers(source_key,document_number,prefix,number_date,sequence,created_at) VALUES(?,?,?,?,?,?)', (key,row['new'],'P',row['date'],row['sequence'],now))
        db.execute('INSERT INTO document_number_sequences(prefix,number_date,last_sequence) VALUES(?,?,?) ON CONFLICT(prefix,number_date) DO UPDATE SET last_sequence=MAX(last_sequence,excluded.last_sequence)', ('P',row['date'],row['sequence']))
        db.execute('UPDATE purchase_bills SET bill_number=?,subtotal_cents=?,total_cents=? WHERE id=?', (row['new'],row['total_cents'],row['total_cents'],b['id']))
        db.execute('UPDATE purchase_bill_items SET unit_price_mills=?,unit_price_cents=?,line_total_cents=? WHERE id=?', (row['price_mills'],row['price_mills']//10,row['total_cents'],row['items'][0]['id']))
        after = dict(db.execute('SELECT * FROM purchase_bills WHERE id=?',(b['id'],)).fetchone())
        require(after['issued_at'] == b['issued_at'], 'Issue time changed')
        after_items = [dict(r) for r in db.execute('SELECT * FROM purchase_bill_items WHERE purchase_bill_id=?',(b['id'],))]
        db.execute('INSERT INTO kc_backfill_correction_audit VALUES(?,?,?,?,?,?,?,?,?)', (BATCH,b['id'],row['old'],row['new'],encode(row),encode(dict(bill=after,items=after_items)),'KC approved service-date numbering; FARLEY RM0.230/kg, SK HARDWARE RM0.190/kg',now,str(backup_path)))
    for trigger in triggers:
        if trigger['name'] == 'document_numbers_no_update':
            db.execute(trigger['sql'])
    for operation in ('UPDATE','DELETE'):
        db.execute(f"CREATE TRIGGER IF NOT EXISTS kc_backfill_audit_no_{operation.lower()} BEFORE {operation} ON kc_backfill_correction_audit BEGIN SELECT RAISE(ABORT,'Correction audit is permanent'); END")
    require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'Database integrity check failed')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', default='/var/lib/kcs/data/kcs-dispatch.db')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--expect', help='Exact SHA256 shown by preview')
    args = parser.parse_args()
    path = pathlib.Path(args.db).resolve()
    require(path.is_file(), 'Database file not found')
    db = sqlite3.connect(path.as_uri()+('?mode=rw' if args.apply else '?mode=ro'),uri=True,timeout=30)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    backup = None
    try:
        if args.apply:
            require(args.expect is not None, 'Run preview first and pass --expect HASH')
            backup = path.with_name(path.name+'.before-'+BATCH+'-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%f')+'.bak')
            with sqlite3.connect(backup) as dest:
                db.backup(dest)
            backup.chmod(0o600)
        db.execute('BEGIN IMMEDIATE' if args.apply else 'BEGIN')
        rows = plan(db); digest = hashlib.sha256(encode(rows).encode()).hexdigest()
        for r in rows:
            print(f"{r['old']} -> {r['new']} | {r['bill']['branch_name_snapshot']} | RM {r['bill']['total_cents']/100:.2f} -> {r['total_cents']/100:.2f}")
        print('Bills:',len(rows),'| Amount difference RM:',format(sum(r['total_cents']-r['bill']['total_cents'] for r in rows)/100,'.2f'))
        print('PREVIEW_SHA256:',digest)
        print('Excluded: P261105-070 (voided); P261105-073 (not requested)')
        if args.apply:
            require(args.expect == digest,'Data or available numbers changed. No changes applied; run preview again.')
            before_fk = [tuple(r) for r in db.execute('PRAGMA foreign_key_check')]
            apply(db,rows,backup)
            require([tuple(r) for r in db.execute('PRAGMA foreign_key_check')] == before_fk,'Foreign-key state changed')
            db.commit();print('APPLIED. Backup:',backup)
        else:
            db.rollback();print('PREVIEW ONLY. No data changed.')
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()
if __name__ == '__main__':
    main()
