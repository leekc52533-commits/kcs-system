"""KC-confirmed link repair only; does not adopt GPS or schedule a collection."""
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
            FROM branches b JOIN customers c ON b.customer_id=c.id WHERE b.id=562""").fetchone()
        check(branch and tuple(branch)[:4] == (562,'B10533','PMG DENTAL 101','PMG DENTAL 101')
              and branch['jodoo_customer_id'], 'Target branch/customer identity mismatch')
        customer = branch['jodoo_customer_id']
        r = db.execute("""SELECT temporary_customer_name,request_type,existing_branch_id,linked_branch_id,linked_customer_id
            FROM special_collection_requests WHERE id=6""").fetchone()
        g = db.execute("""SELECT special_request_id,branch_id,dispatch_stop_id,verification_status
            FROM temporary_locations WHERE id=300""").fetchone()
        check(r and r[0]=='PMG DENTAL 101' and g and g[0]==6, 'GPS/request identity mismatch')
        if tuple(r)[1:]==('existing',562,'B10533',customer) and g[1]==562:
            db.rollback()
            return 'Already linked; nothing changed.'
        check(r[2] is None and r[3] is None and r[4] in (None,'',customer)
              and tuple(g)[1:]==(None,None,'pending_supervisor'), 'Request or GPS has changed. No changes made.')
        fd,backup=tempfile.mkstemp(prefix='before-gps300-',suffix='.bak',dir=Path(path).parent)
        os.close(fd)
        src=sqlite3.connect(uri+'?mode=ro',uri=True)
        dst=sqlite3.connect(backup)
        try:
            src.backup(dst)
            check(dst.execute('PRAGMA quick_check').fetchone()[0]=='ok','Backup check failed')
        finally:
            src.close()
            dst.close()
        db.execute("""UPDATE special_collection_requests SET request_type='existing',existing_branch_id=562,
            linked_branch_id='B10533',linked_customer_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=6""",(customer,))
        db.execute('UPDATE temporary_locations SET branch_id=562 WHERE id=300')
        check(db.execute("""SELECT COUNT(*) FROM temporary_locations t JOIN special_collection_requests r
            ON t.special_request_id=r.id WHERE t.id=300 AND r.id=6 AND t.branch_id=r.existing_branch_id
            AND t.branch_id=562 AND r.linked_branch_id='B10533' AND r.linked_customer_id=?
            AND t.verification_status='pending_supervisor'""",(customer,)).fetchone()[0]==1,'Link verification failed')
        db.execute("""INSERT INTO audit_logs(action,entity_type,entity_id,before_json,after_json)
            VALUES('gps_request_branch_link_repaired','temporary_location','300',?,?)""",
            (json.dumps({'request':dict(r),'location':dict(g)}),json.dumps({'requestId':6,'branchId':562,
             'branchCode':'B10533','customerCode':customer,'approval':'KC confirmed PMG DENTAL 101',
             'gpsStatus':'pending_supervisor'})))
        db.commit()
        return 'APPLIED: request #6 and GPS #300 -> B10533. GPS still pending. Backup: '+backup
    finally:
        db.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db',default='/var/lib/kcs/data/kcs-dispatch.db')
    print(repair(parser.parse_args().db))
