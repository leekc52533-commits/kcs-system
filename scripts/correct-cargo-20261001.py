"""KC-approved correction for ten October 1 unloads; preview unless --apply.

Never rewrites source tickets, batches, members, weights, photos or paid snapshots.
Requires the deployed cargo_unload_corrections schema. Run with kcs-api stopped.
"""
import argparse
import json
import sqlite3
from datetime import datetime
from zoneinfo import ZoneInfo

REFERENCE = 'KC-CARGO-20261001'
DATE = '2026-10-01'
REASON = 'KC confirmed 2026-10-01: new October collection; QAIRUL and PHANG drive separately; AHAZHAR crew remains ALDYFERNENDES.'
PLAN = [
    ('PHANG KHONG YEN', 'QM3028M', [], 'H260922-011', '2026-09-22',
     [(157, '154566', 1400), (160, '154636', 1160)]),
    ('QAIRUL HIQMAH BIN ABDULL', 'QAV3468', [], 'H260919-006', '2026-09-19',
     [(158, '154571', 1290), (159, '154614', 1010)]),
    ('AHAZHAR BIN BADOR', 'QAA4293N', ['ALDYFERNENDES IVAN AK DIANA'], 'H260919-007', '2026-09-19',
     [(161, '154625', 1080), (162, '154570', 1010), (163, '154584', 760)]),
    ('MOHD AZIZUL BIN SAMI', 'QM630S', [], 'H260919-008', '2026-09-19',
     [(164, '154605', 890), (165, '15483', 1320), (166, '154567', 1490)]),
]


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def run(path, apply=False):
    db = sqlite3.connect('file:' + path + '?mode=rw', uri=True, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    try:
        require(db.execute("SELECT 1 FROM sqlite_master WHERE name='cargo_unload_corrections'").fetchone(),
                'Deploy and restart the updated application first.')
        backup_path = None
        if apply:
            stamp = datetime.now(ZoneInfo('Asia/Kuching')).strftime('%Y%m%d-%H%M%S-%f')
            backup_path = path + '.before-cargo-fix-' + stamp
            with sqlite3.connect(backup_path) as backup:
                db.backup(backup)
            print('BACKUP:', backup_path)
        db.execute('BEGIN IMMEDIATE' if apply else 'BEGIN')
        ids = sorted(r[0] for p in PLAN for r in p[5])
        previous = db.execute('SELECT * FROM cargo_unload_corrections WHERE reference=?', (REFERENCE,)).fetchall()
        require(not previous or sorted(r['record_id'] for r in previous) == ids,
                'Incomplete or unexpected prior repair. No changes.')
        groups = []
        for driver, plate, crew, old_code, old_date, records in PLAN:
            members = []
            for name in [driver] + crew:
                people = db.execute('SELECT id,name FROM employees WHERE name=?', (name,)).fetchall()
                require(len(people) == 1, 'Employee name is missing or ambiguous: ' + name)
                members.append((people[0]['id'], name, 'driver' if name == driver else 'crew'))
            source = []
            for record_id, ticket, weight in records:
                row = db.execute('''SELECT w.*,u.batch_id,u.ticket_number,u.mode,u.next_batch_id,
                    b.code old_code,b.collection_date old_date
                    FROM unloading_weight_records w JOIN cargo_batch_unloads u ON u.record_id=w.id
                    JOIN cargo_batches b ON b.id=u.batch_id WHERE w.id=?''', (record_id,)).fetchone()
                require(row is not None, 'Missing original record: ' + str(record_id))
                require(row['service_date'] == DATE and row['status'] == 'confirmed'
                        and row['driver_employee_id'] == members[0][0]
                        and row['driver_name_snapshot'] == driver
                        and row['registration_number_snapshot'] == plate
                        and row['confirmed_weight_kg'] == weight
                        and row['ticket_number'] == ticket
                        and row['old_code'] == old_code and row['old_date'] == old_date,
                        'Source changed; inspect record ' + str(record_id))
                correction = db.execute('SELECT * FROM cargo_unload_corrections WHERE record_id=?', (record_id,)).fetchone()
                require(not correction or correction['reference'] == REFERENCE,
                        'Another correction already exists: ' + str(record_id))
                if previous:
                    require(correction is not None, 'Missing prior correction')
                    b = db.execute('SELECT * FROM cargo_batches WHERE id=?', (correction['batch_id'],)).fetchone()
                    actual = db.execute('SELECT employee_id,name_snapshot,role FROM cargo_batch_members WHERE batch_id=?', (b['id'],)).fetchall()
                    require(b['collection_date'] == DATE and b['vehicle_id'] == row['vehicle_id']
                            and sorted(tuple(m) for m in actual) == sorted(members), 'Prior repair changed; inspect manually.')
                source.append(dict(row))
            require(len({r['vehicle_id'] for r in source}) == 1, 'Unexpected mixed vehicles')
            groups.append((members, source))
            print(driver, '+', ' / '.join(crew) or 'no crew', ':', f'{sum(r[2] for r in records):,.2f}', 'kg')
        if previous:
            print('ALREADY APPLIED: 10 records; no changes.')
            db.rollback()
            return
        # A paid source or destination period needs separate payroll reconciliation.
        affected = {m[0] for members, _ in groups for m in members}
        for _, source in groups:
            for row in source:
                affected.update(r[0] for r in db.execute('SELECT employee_id FROM cargo_batch_members WHERE batch_id=?', (row['batch_id'],)))
        for employee_id in affected:
            require(not db.execute("SELECT 1 FROM earnings_payments WHERE employee_id=? AND period_start IN ('2026-09-16','2026-10-01')", (employee_id,)).fetchone(),
                    'A related period is already paid. No changes; payroll reconciliation required.')
        if not apply:
            print('PREVIEW OK: 10 records / 11,410.00 kg. Run again with --apply to save.')
            db.rollback()
            return
        for members, source in groups:
            first = source[0]
            # Closed historical attribution batch, not a claim that today's physical cargo is empty.
            cursor = db.execute('''INSERT INTO cargo_batches(vehicle_id,plate_snapshot,status,
                created_by_employee_id,collection_date,driver_employee_id,driver_name_snapshot,eligible_crew_json)
                VALUES(?,?,'closed',?,?,?,?,?)''',
                (first['vehicle_id'], first['registration_number_snapshot'], members[0][0], DATE,
                 members[0][0], members[0][1], json.dumps([{'id':m[0],'name':m[1]} for m in members[1:]])))
            batch_id = cursor.lastrowid
            db.execute('UPDATE cargo_batches SET code=? WHERE id=?', (f'H261001-{batch_id:03d}', batch_id))
            db.executemany('INSERT INTO cargo_batch_members(batch_id,employee_id,name_snapshot,role) VALUES(?,?,?,?)',
                           [(batch_id, *m) for m in members])
            for row in source:
                before = {'unload':row, 'originalMembers':[dict(r) for r in db.execute('SELECT * FROM cargo_batch_members WHERE batch_id=?', (row['batch_id'],))]}
                db.execute('''INSERT INTO cargo_unload_corrections(record_id,original_batch_id,batch_id,
                    reference,reason,approved_by,before_json) VALUES(?,?,?,?,?,?,?)''',
                    (row['id'], row['batch_id'], batch_id, REFERENCE, REASON, 'KC (confirmed in support conversation)', json.dumps(before)))
                db.execute('INSERT INTO audit_logs(action,entity_type,entity_id,after_json) VALUES(?,?,?,?)',
                           ('cargo_attribution_corrected','unloading_weight',str(row['id']),json.dumps({
                               'reference':REFERENCE,'approvedBy':'KC','reason':REASON,'before':before,
                               'batchId':batch_id,'collectionDate':DATE,'members':members})))
        require(db.execute('SELECT COUNT(*) FROM cargo_unload_corrections WHERE reference=?', (REFERENCE,)).fetchone()[0] == 10,
                'Correction count mismatch')
        require(not db.execute('PRAGMA foreign_key_check').fetchall(), 'Foreign key check failed')
        db.commit()
        print('SUCCESS: 10 records / 11,410.00 kg attributed to 01/10/2026 and confirmed employees.')
        print('Original September batches, ticket numbers, weights, photos and paid snapshots preserved.')
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', default='/var/lib/kcs/data/kcs-dispatch.db')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    try:
        run(args.db, args.apply)
    except Exception as error:
        raise SystemExit('STOPPED - NO CHANGES: ' + str(error))
