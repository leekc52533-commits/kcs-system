export const repeatDateSchema=`
CREATE TABLE IF NOT EXISTS driver_date_repeat_reviews(
 request_id INTEGER PRIMARY KEY REFERENCES driver_date_requests(id),
 branch_id INTEGER NOT NULL REFERENCES branches(id), approval_number INTEGER NOT NULL,
 confirmed_at TEXT NOT NULL, reviewer TEXT NOT NULL,
 contact_name TEXT, contact_at TEXT, contact_result TEXT,
 proof BLOB, content_type TEXT,
 CHECK(approval_number>=2));
CREATE TRIGGER IF NOT EXISTS repeat_date_review_no_update BEFORE UPDATE ON driver_date_repeat_reviews BEGIN SELECT RAISE(ABORT,'Approval evidence is immutable'); END;
CREATE TRIGGER IF NOT EXISTS repeat_date_review_no_delete BEFORE DELETE ON driver_date_repeat_reviews BEGIN SELECT RAISE(ABORT,'Approval evidence is immutable'); END;
`
export const ensureRepeatDateSchema=db=>db.exec(repeatDateSchema)
