"""Append KC-confirmed crew/date corrections for October 1–2. Preview by default.

Deploy first. Stop kcs-api while applying. Original links and earlier corrections
are retained. Any source mismatch or affected paid period stops the whole repair.
"""
import argparse
import json
import sqlite3
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

REFERENCE = 'KC-CARGO-CREW-20261002'
REASON = 'KC confirmed 2026-10-02: October 1 AUGUSTINE with AZIZUL and ZAIFUL with QAIRUL; October 2 named crews and weights are new collection that day.'
APPROVER = 'KC (confirmed in support conversation 2026-10-02)'
# date, driver, plate, crew, existing effective batch, existing date, record IDs, kg
PLAN = [
    ('2026-10-01', 'MOHD AZIZUL BIN SAMI', 'QM630S', ['AUGUSTINE SUMUT AK MARA'], 'H261001-028', '2026-10-01', [164,165,166], 3700),
    ('2026-10-01', 'QAIRUL HIQMAH BIN ABDULL', 'QAV3468', ['MOHD ZAIFUL BIN SAMIS'], 'H261001-026', '2026-10-01', [158,159], 2300),
    ('2026-10-02', 'AHAZHAR BIN BADOR', 'QAA4293N', ['ALDYFERNENDES IVAN AK DIANA'], 'H260919-007', '2026-09-19', [173,174,175], 2420),
    ('2026-10-02', 'MOHAMMAD FAIS MOHAMAD REZZY', 'QTY5028', ['MUHAMMAD ISMAIL BIN JUKI'], 'H260930-024', '2026-09-30', [171], 1260),
    ('2026-10-02', 'PHANG KHONG YEN', 'QM3028M', ['MOHD ZAIFUL BIN SAMIS','BALLSON LEE ANAK BANOS'], 'H260922-011', '2026-09-22', [169,172,177], 2950),
    ('2026-10-02', 'QAIRUL HIQMAH BIN ABDULL', 'QAV3468', [], 'H261001-026', '2026-10-01', [167,170,178], 2310),
]


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def members(db, batch_id):
    return [tuple(r) for r in db.execute('SELECT employee_id,name_snapshot,role FROM cargo_batch_members WHERE batch_id=? ORDER BY employee_id', (batch_id,))]


def run(path, apply=False):
    db = sqlite3.connect('file:' + path + '?mode=rw', uri=True, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    try:
        require(db.execute("SELECT 1 FROM sqlite_master WHERE name='cargo_unload_correction_revisions'").fetchone(), 'Deploy and restart the updated application first.')
        if apply:
            stamp = datetime.now(ZoneInfo('Asia/Kuching')).strftime('%Y%m%d-%H%M%S-%f')
            backup_path = path + '.before-crew-fix-' + stamp
            with sqlite3.connect(backup_path) as backup:
                db.backup(backup)
            print('BACKUP:', backup_path)
        db.execute('BEGIN IMMEDIATE' if apply else 'BEGIN')
        ids = sorted(i for p in PLAN for i in p[6])
        prior = db.execute('SELECT * FROM cargo_unload_correction_revisions WHERE reference=?', (REFERENCE,)).fetchall()
        require(not prior or sorted(r['record_id'] for r in prior) == ids, 'Incomplete prior repair; inspect before proceeding.')
        groups = []
        affected = set()
        for date, driver, plate, crew, old_code, old_date, record_ids, expected_kg in PLAN:
            target_members = []
            for name in [driver] + crew:
                people = db.execute('SELECT id,name FROM employees WHERE name=?', (name,)).fetchall()
                require(len(people) == 1, 'Missing or ambiguous employee: ' + name)
                target_members.append((people[0]['id'],name,'driver' if name == driver else 'crew'))
            source = []
            for record_id in record_ids:
                r = db.execute('''SELECT w.*,u.batch_id original_batch_id,u.ticket_number,
                    COALESCE(cr.batch_id,c.batch_id,u.batch_id) effective_batch_id,
                    cr.id revision_id,cr.reference revision_reference,
                    b.code effective_code,b.collection_date effective_date
                    FROM unloading_weight_records w JOIN cargo_batch_unloads u ON u.record_id=w.id
                    LEFT JOIN cargo_unload_corrections c ON c.record_id=w.id
                    LEFT JOIN cargo_unload_correction_revisions cr ON cr.id=(
                        SELECT MAX(r.id) FROM cargo_unload_correction_revisions r WHERE r.record_id=w.id)
                    JOIN cargo_batches b ON b.id=COALESCE(cr.batch_id,c.batch_id,u.batch_id)
                    WHERE w.id=?''', (record_id,)).fetchone()
                require(r is not None, 'Missing record ' + str(record_id))
                require(r['service_date'] == date and r['status'] == 'confirmed'
                        and r['driver_employee_id'] == target_members[0][0]
                        and r['driver_name_snapshot'] == driver and r['registration_number_snapshot'] == plate
                        and r['confirmed_weight_kg'] is not None and r['confirmed_weight_kg'] > 0
                        and str(r['ticket_number']).strip(), 'Changed source record ' + str(record_id))
                if prior:
                    require(r['revision_reference'] == REFERENCE and r['effective_date'] == date
                            and sorted(members(db,r['effective_batch_id'])) == sorted(target_members),
                            'Existing correction was superseded or changed; inspect record ' + str(record_id))
                else:
                    require(r['revision_id'] is None and r['effective_code'] == old_code and r['effective_date'] == old_date,
                            'Attribution changed; inspect record ' + str(record_id))
                current_members = members(db,r['effective_batch_id'])
                affected.update(m[0] for m in current_members + target_members)
                source.append({'record':dict(r),'members':current_members})
            require(len({r['record']['vehicle_id'] for r in source}) == 1, 'Unexpected mixed vehicles')
            require(sum(Decimal(str(r['record']['confirmed_weight_kg'])) for r in source) == Decimal(expected_kg),
                    'Weight total changed for ' + driver + ' / ' + date)
            groups.append((date,target_members,source))
            print(date, driver, '+', ' / '.join(crew) or 'no crew', ':', f'{expected_kg:,.2f}', 'kg')
        if prior:
            print('ALREADY APPLIED: 15 records; no changes.')
            db.rollback()
            return
        for employee_id in affected:
            require(not db.execute("SELECT 1 FROM earnings_payments WHERE employee_id=? AND period_start IN ('2026-09-16','2026-10-01')", (employee_id,)).fetchone(), 'A related period is paid; payroll reconciliation required. No changes.')
        if not apply:
            print('PREVIEW OK: 15 records. Run with --apply to save.')
            db.rollback()
            return
        for date, target_members, source in groups:
            first = source[0]['record']
            cursor = db.execute('''INSERT INTO cargo_batches(vehicle_id,plate_snapshot,status,created_by_employee_id,
                collection_date,driver_employee_id,driver_name_snapshot,eligible_crew_json)
                VALUES(?,?,'closed',?,?,?,?,?)''',
                (first['vehicle_id'],first['registration_number_snapshot'],target_members[0][0],date,
                 target_members[0][0],target_members[0][1],json.dumps([{'id':m[0],'name':m[1]} for m in target_members[1:]])))
            batch_id = cursor.lastrowid
            code = 'H' + date.replace('-','')[2:] + f'-{batch_id:03d}'
            db.execute('UPDATE cargo_batches SET code=? WHERE id=?', (code,batch_id))
            db.executemany('INSERT INTO cargo_batch_members(batch_id,employee_id,name_snapshot,role) VALUES(?,?,?,?)', [(batch_id,*m) for m in target_members])
            for before in source:
                r = before['record']
                db.execute('''INSERT INTO cargo_unload_correction_revisions(record_id,previous_batch_id,batch_id,
                    reference,reason,approved_by,before_json) VALUES(?,?,?,?,?,?,?)''',
                    (r['id'],r['effective_batch_id'],batch_id,REFERENCE,REASON,APPROVER,json.dumps(before)))
                db.execute('INSERT INTO audit_logs(action,entity_type,entity_id,after_json) VALUES(?,?,?,?)',
                    ('cargo_attribution_revised','unloading_weight',str(r['id']),json.dumps({
                        'reference':REFERENCE,'approvedBy':APPROVER,'reason':REASON,'before':before,
                        'batchId':batch_id,'collectionDate':date,'members':target_members})))
        require(db.execute('SELECT COUNT(*) FROM cargo_unload_correction_revisions WHERE reference=?', (REFERENCE,)).fetchone()[0] == 15, 'Correction count mismatch')
        require(not db.execute('PRAGMA foreign_key_check').fetchall(), 'Foreign key check failed')
        db.commit()
        print('SUCCESS: 15 records corrected; October 1 missing crews restored and October 2 attribution corrected.')
        print('Earlier corrections, original tickets, weights and photos retained. No duplicate weight created.')
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
        run(args.db,args.apply)
    except Exception as error:
        raise SystemExit('STOPPED - NO CHANGES: ' + str(error))
