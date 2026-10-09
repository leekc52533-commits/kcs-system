"""KC-authorized company merge only; B10515 remains a separate branch."""
import datetime
import json
import pathlib
import sqlite3
import sys

path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/var/lib/kcs/data/kcs-dispatch.db')
if not path.is_file():
    raise SystemExit('数据库不存在，未修改。')
db = sqlite3.connect(str(path), timeout=30)
db.row_factory = sqlite3.Row
db.execute('PRAGMA foreign_keys=ON')
reason = 'KC confirmed: merge C10290 into C10003; preserve B10515 as a separate branch from ALPRO BT3.'
try:
    backup = path.with_name(path.name + '.before-alpro-merge-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
    with sqlite3.connect(str(backup)) as copy:
        db.backup(copy)
    backup.chmod(0o600)
    db.execute('BEGIN IMMEDIATE')
    def row(sql, *args):
        r = db.execute(sql, args).fetchone()
        if r is None:
            raise ValueError('找不到指定记录，未修改。')
        return dict(r)
    target = row('SELECT * FROM customers WHERE id=251')
    source = row('SELECT * FROM customers WHERE id=272')
    branch = row('SELECT * FROM branches WHERE id=544')
    assert target['jodoo_customer_id'] in ('10003','C10003') and target['name'] == 'ALPRO'
    assert source['jodoo_customer_id'] == 'C10290' and source['name'] == 'alpro 3rd miles'
    assert branch['jodoo_branch_id'] == 'B10515' and branch['branch_name'] == 'alpro 3rd miles'
    assert target['status'] == 'active'
    assert branch['customer_id'] in (251,272)
    assert not db.execute('SELECT 1 FROM branches WHERE customer_id=272 AND id<>544').fetchone(), '原公司还有其他分店，已停止。'
    if branch['customer_id'] == 251 and source['status'] == 'inactive':
        db.rollback()
        print('已经完成过：B10515 属于 C10003；未重复修改。')
    else:
        db.execute('UPDATE branches SET customer_id=251,source_customer_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=544', (target['jodoo_customer_id'],))
        db.execute("UPDATE customers SET status='inactive',is_active=0,updated_at=CURRENT_TIMESTAMP WHERE id=272")
        for kind, code, before, after in [
            ('branch','B10515',branch,row('SELECT * FROM branches WHERE id=544')),
            ('customer','C10290',source,row('SELECT * FROM customers WHERE id=272'))
        ]:
            db.execute('INSERT INTO master_change_history(entity_type,entity_id,change_type,before_json,after_json,reason,changed_by) VALUES(?,?,?,?,?,?,?)',
                       (kind,code,'company_merge',json.dumps(before,ensure_ascii=False),json.dumps(after,ensure_ascii=False),reason,'KC authorized maintenance'))
        db.commit()
        print('完成：B10515 已归入 C10003 ALPRO；C10290 已停用。')
        print('B10515 与 ALPRO BT3 继续是两个独立分店。GPS、行程和历史单据未改写。')
    print('备份：', backup)
except Exception:
    db.rollback()
    raise
finally:
    db.close()
