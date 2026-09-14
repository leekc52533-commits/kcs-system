export const unloadingCorrectionSchema=`
CREATE TABLE IF NOT EXISTS unloading_correction_requests(
 id INTEGER PRIMARY KEY,record_id INTEGER NOT NULL REFERENCES unloading_weight_records(id),
 before_json TEXT NOT NULL,after_json TEXT NOT NULL,expected_revision TEXT NOT NULL,reason TEXT NOT NULL,
 requester_account_id INTEGER NOT NULL REFERENCES auth_accounts(id),requester_name TEXT NOT NULL,created_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reviewer_account_id INTEGER REFERENCES auth_accounts(id),reviewer_name TEXT,review_reason TEXT,reviewed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS unloading_one_pending ON unloading_correction_requests(record_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS unloading_corrections(
 id INTEGER PRIMARY KEY,request_id INTEGER NOT NULL UNIQUE REFERENCES unloading_correction_requests(id),record_id INTEGER NOT NULL REFERENCES unloading_weight_records(id),
 before_json TEXT NOT NULL,after_json TEXT NOT NULL,reason TEXT NOT NULL,review_reason TEXT NOT NULL,
 actor_account_id INTEGER NOT NULL REFERENCES auth_accounts(id),actor_name TEXT NOT NULL,created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS unloading_audit_no_update BEFORE UPDATE ON unloading_corrections BEGIN SELECT RAISE(ABORT,'Audit is immutable'); END;
CREATE TRIGGER IF NOT EXISTS unloading_audit_no_delete BEFORE DELETE ON unloading_corrections BEGIN SELECT RAISE(ABORT,'Audit is immutable'); END;
CREATE TRIGGER IF NOT EXISTS unloading_request_no_delete BEFORE DELETE ON unloading_correction_requests BEGIN SELECT RAISE(ABORT,'Request is permanent'); END;
CREATE TRIGGER IF NOT EXISTS unloading_request_immutable BEFORE UPDATE ON unloading_correction_requests WHEN OLD.status<>'pending' OR NEW.record_id<>OLD.record_id OR NEW.before_json<>OLD.before_json OR NEW.after_json<>OLD.after_json OR NEW.expected_revision<>OLD.expected_revision OR NEW.reason<>OLD.reason OR NEW.requester_account_id<>OLD.requester_account_id OR NEW.requester_name<>OLD.requester_name OR NEW.created_at<>OLD.created_at BEGIN SELECT RAISE(ABORT,'Request content is immutable'); END;
`
export function applyV70Migration(db){const v=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v);if(v>=70){db.exec(unloadingCorrectionSchema);return}if(v!==69)throw Error('Schema 69 required');db.exec('BEGIN IMMEDIATE');try{db.exec(unloadingCorrectionSchema);db.exec('INSERT INTO schema_meta(version) VALUES(70)');db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}
