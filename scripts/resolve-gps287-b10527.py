"""KC-confirmed Momoyo link repair and keep-official review; does not adopt GPS or schedule a collection."""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import tempfile


def check(ok, message):
    if not ok:
        raise ValueError(message)


def repair(path):
    uri = Path(path).resolve().as_uri()
    db = sqlite3.connect(uri + '?mode=rw', uri=True, timeout=30)
    db.row_factory = sqlite3.Row
    try:
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('BEGIN IMMEDIATE')
        branch = db.execute("""SELECT b.id,b.jodoo_branch_id,b.branch_name,c.name,c.jodoo_customer_id
            FROM branches b JOIN customers c ON b.customer_id=c.id WHERE b.id=556""").fetchone()
        check(branch and tuple(branch)[:4] == (556,'B10527','momoyo demak','momoyo demak')
              and branch['jodoo_customer_id'], 'Target branch/customer identity mismatch')
        customer = branch['jodoo_customer_id']
        r = db.execute("""SELECT temporary_customer_name,request_type,existing_branch_id,linked_branch_id,linked_customer_id
            FROM special_collection_requests WHERE id=4""").fetchone()
        g = db.execute("""SELECT special_request_id,branch_id,dispatch_stop_id,verification_status
            FROM temporary_locations WHERE id=287""").fetchone()
        check(r and r[0]=='Momoyo Demak Laut' and g and g[0]==4, 'GPS/request identity mismatch')
        official = db.execute('SELECT latitude,longitude FROM branches WHERE id=556').fetchone()
        captured = db.execute('SELECT latitude,longitude FROM temporary_locations WHERE id=287').fetchone()
        check(tuple(official)==(1.5912575,110.43252) and tuple(captured)==(1.5912565,110.4325207),
              'GPS coordinates changed; review again.')
        if tuple(r)[1:]==('existing',556,'B10527',customer) and g[1]==556 and g[3]=='kept_official':
            db.rollback()
            return 'Already resolved; nothing changed.'
        check(r[2] is None and r[3] is None and r[4] in (None,'',customer)
              and tuple(g)[1:]==(None,None,'pending_supervisor'), 'Request or GPS has changed. No changes made.')
        fd,backup=tempfile.mkstemp(prefix='before-gps287-',suffix='.bak',dir=Path(path).parent)
        os.close(fd)
        src=sqlite3.connect(uri+'?mode=ro',uri=True)
        dst=sqlite3.connect(backup)
        try:
            src.backup(dst)
            check(dst.execute('PRAGMA quick_check').fetchone()[0]=='ok','Backup check failed')
        finally:
            src.close()
            dst.close()
        db.execute("""UPDATE special_collection_requests SET request_type='existing',existing_branch_id=556,
            linked_branch_id='B10527',linked_customer_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=4""",(customer,))
        reason = 'KC confirmed Momoyo Demak Laut is B10527; retain existing official GPS.'
        actor = 'Server maintenance (KC confirmed)'
        db.execute("""UPDATE temporary_locations SET branch_id=556,verification_status='kept_official',
            review_decision='keep_official',review_reason=?,reviewed_by=?,reviewed_by_account_id=NULL,
            reviewed_at=CURRENT_TIMESTAMP WHERE id=287""",(reason,actor))
        db.execute("""INSERT INTO audit_logs(action,entity_type,entity_id,before_json,after_json)
            VALUES('temporary_gps_reviewed','branch','556',?,?)""",
            (json.dumps({'officialGps':{'latitude':official[0],'longitude':official[1]}}),
             json.dumps({'temporaryLocationId':287,'suggestedGps':{'latitude':captured[0],'longitude':captured[1]},
                         'decision':'keep_official','decidedBy':actor,'reason':reason})))
        check(db.execute("""SELECT COUNT(*) FROM temporary_locations t JOIN special_collection_requests r
            ON t.special_request_id=r.id WHERE t.id=287 AND r.id=4 AND t.branch_id=r.existing_branch_id
            AND t.branch_id=556 AND r.linked_branch_id='B10527' AND r.linked_customer_id=?
            AND t.verification_status='kept_official'""",(customer,)).fetchone()[0]==1,'Link verification failed')
        db.execute("""INSERT INTO audit_logs(action,entity_type,entity_id,before_json,after_json)
            VALUES('gps_request_branch_link_repaired','temporary_location','287',?,?)""",
            (json.dumps({'request':dict(r),'location':dict(g)}),json.dumps({'requestId':4,'branchId':556,
             'branchCode':'B10527','customerCode':customer,'approval':'KC confirmed momoyo demak',
             'gpsStatus':'kept_official'})))
        db.commit()
        return 'APPLIED: request #4 and GPS #287 -> B10527. Existing official GPS kept. Backup: '+backup
    finally:
        db.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db',default='/var/lib/kcs/data/kcs-dispatch.db')
    print(repair(parser.parse_args().db))
