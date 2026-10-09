// Explicit commitments apply to new customer-date requests only; never infer promises from legacy reasons.
export function ensureCustomerDatePromiseSchema(db){
 db.exec(`CREATE TABLE IF NOT EXISTS customer_date_promises(
  request_id INTEGER PRIMARY KEY REFERENCES driver_date_requests(id),
  stop_id INTEGER NOT NULL UNIQUE REFERENCES dispatch_stops(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  promised_date TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('once','permanent')),
  approved_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 );
 CREATE TRIGGER IF NOT EXISTS customer_promise_stop_update BEFORE UPDATE ON dispatch_stops
 WHEN EXISTS(SELECT 1 FROM customer_date_promises p WHERE p.stop_id=OLD.id AND
 (NEW.service_date IS NOT p.promised_date OR NEW.branch_id IS NOT p.branch_id OR NEW.status='cancelled' OR
 (SELECT d.dispatch_date FROM dispatch_trips t JOIN dispatch_days d ON d.id=t.dispatch_day_id WHERE t.id=NEW.dispatch_trip_id) IS NOT p.promised_date))
 BEGIN SELECT RAISE(ABORT,'CUSTOMER_DATE_LOCKED'); END;
 CREATE TRIGGER IF NOT EXISTS customer_promise_stop_delete BEFORE DELETE ON dispatch_stops
 WHEN EXISTS(SELECT 1 FROM customer_date_promises WHERE stop_id=OLD.id)
 BEGIN SELECT RAISE(ABORT,'CUSTOMER_DATE_LOCKED'); END;
 CREATE TRIGGER IF NOT EXISTS customer_promise_day_update BEFORE UPDATE OF dispatch_date ON dispatch_days
 WHEN NEW.dispatch_date IS NOT OLD.dispatch_date AND EXISTS(SELECT 1 FROM customer_date_promises p JOIN dispatch_stops s ON s.id=p.stop_id JOIN dispatch_trips t ON t.id=s.dispatch_trip_id WHERE t.dispatch_day_id=OLD.id)
 BEGIN SELECT RAISE(ABORT,'CUSTOMER_DATE_LOCKED'); END;
 CREATE TRIGGER IF NOT EXISTS customer_promise_trip_update BEFORE UPDATE OF dispatch_day_id ON dispatch_trips
 WHEN EXISTS(SELECT 1 FROM customer_date_promises p JOIN dispatch_stops s ON s.id=p.stop_id WHERE s.dispatch_trip_id=OLD.id AND p.promised_date IS NOT (SELECT dispatch_date FROM dispatch_days WHERE id=NEW.dispatch_day_id))
 BEGIN SELECT RAISE(ABORT,'CUSTOMER_DATE_LOCKED'); END;
 CREATE TRIGGER IF NOT EXISTS customer_promise_exception_insert BEFORE INSERT ON schedule_exceptions
 WHEN NEW.exception_type IN ('move_date','cancel_date','pause_once') AND (NEW.exception_type<>'move_date' OR NEW.target_date IS NOT NEW.original_date)
 AND EXISTS(SELECT 1 FROM customer_date_promises WHERE branch_id=NEW.branch_id AND promised_date=NEW.original_date)
 BEGIN SELECT RAISE(ABORT,'CUSTOMER_DATE_LOCKED'); END;
 CREATE TRIGGER IF NOT EXISTS customer_promise_exception_update BEFORE UPDATE ON schedule_exceptions
 WHEN NEW.exception_type IN ('move_date','cancel_date','pause_once') AND (NEW.exception_type<>'move_date' OR NEW.target_date IS NOT NEW.original_date)
 AND EXISTS(SELECT 1 FROM customer_date_promises WHERE branch_id=NEW.branch_id AND promised_date=NEW.original_date)
 BEGIN SELECT RAISE(ABORT,'CUSTOMER_DATE_LOCKED'); END;`)
}
export function customerDatePromise(db,stopId){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='customer_date_promises'").get())return null
 return db.prepare('SELECT request_id requestId,promised_date date,scope FROM customer_date_promises WHERE stop_id=?').get(stopId)||null
}
export function assertCustomerDateUnlocked(db,stopId){if(customerDatePromise(db,stopId))throw Object.assign(new Error('CUSTOMER_DATE_LOCKED'),{code:'CUSTOMER_DATE_LOCKED',statusCode:409})}
