export function ensureDriverPlanSchema(db){
 db.exec(`CREATE TABLE IF NOT EXISTS driver_plan_checks(
 trip_id INTEGER PRIMARY KEY REFERENCES dispatch_trips(id) ON DELETE CASCADE,
 employee_id INTEGER NOT NULL REFERENCES employees(id),employee_name TEXT NOT NULL,
 plan_signature TEXT NOT NULL,checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TRIGGER IF NOT EXISTS driver_plan_stop_insert AFTER INSERT ON dispatch_stops BEGIN DELETE FROM driver_plan_checks WHERE trip_id=NEW.dispatch_trip_id; END;
 CREATE TRIGGER IF NOT EXISTS driver_plan_stop_delete AFTER DELETE ON dispatch_stops BEGIN DELETE FROM driver_plan_checks WHERE trip_id=OLD.dispatch_trip_id; END;
 CREATE TRIGGER IF NOT EXISTS driver_plan_stop_update AFTER UPDATE OF dispatch_trip_id,dispatch_id,branch_id,route_number,route_stop_sequence,stop_sequence,service_date,status ON dispatch_stops
 WHEN OLD.dispatch_trip_id IS NOT NEW.dispatch_trip_id OR OLD.dispatch_id IS NOT NEW.dispatch_id OR OLD.branch_id IS NOT NEW.branch_id OR OLD.route_number IS NOT NEW.route_number OR OLD.route_stop_sequence IS NOT NEW.route_stop_sequence OR OLD.stop_sequence IS NOT NEW.stop_sequence OR OLD.service_date IS NOT NEW.service_date OR (OLD.status='cancelled')<>(NEW.status='cancelled')
 BEGIN DELETE FROM driver_plan_checks WHERE trip_id IN(OLD.dispatch_trip_id,NEW.dispatch_trip_id); END;
 CREATE TRIGGER IF NOT EXISTS driver_plan_assignment_update AFTER UPDATE OF driver_id,assistant_id,vehicle_id ON dispatches
 WHEN OLD.driver_id IS NOT NEW.driver_id OR OLD.assistant_id IS NOT NEW.assistant_id OR OLD.vehicle_id IS NOT NEW.vehicle_id
 BEGIN DELETE FROM driver_plan_checks WHERE trip_id IN(SELECT id FROM dispatch_trips WHERE dispatch_id=NEW.id); END;
 CREATE TRIGGER IF NOT EXISTS driver_plan_crew_insert AFTER INSERT ON dispatch_vehicle_assistants BEGIN DELETE FROM driver_plan_checks WHERE trip_id IN(SELECT t.id FROM dispatch_trips t JOIN dispatches d ON d.id=t.dispatch_id WHERE t.dispatch_day_id=NEW.dispatch_day_id AND d.vehicle_id=NEW.vehicle_id); END;
 CREATE TRIGGER IF NOT EXISTS driver_plan_crew_delete AFTER DELETE ON dispatch_vehicle_assistants BEGIN DELETE FROM driver_plan_checks WHERE trip_id IN(SELECT t.id FROM dispatch_trips t JOIN dispatches d ON d.id=t.dispatch_id WHERE t.dispatch_day_id=OLD.dispatch_day_id AND d.vehicle_id=OLD.vehicle_id); END;
 CREATE TRIGGER IF NOT EXISTS driver_plan_crew_update AFTER UPDATE ON dispatch_vehicle_assistants WHEN OLD.employee_id IS NOT NEW.employee_id OR OLD.vehicle_id IS NOT NEW.vehicle_id OR OLD.dispatch_day_id IS NOT NEW.dispatch_day_id BEGIN DELETE FROM driver_plan_checks WHERE trip_id IN(SELECT t.id FROM dispatch_trips t JOIN dispatches d ON d.id=t.dispatch_id WHERE (t.dispatch_day_id=OLD.dispatch_day_id AND d.vehicle_id=OLD.vehicle_id) OR (t.dispatch_day_id=NEW.dispatch_day_id AND d.vehicle_id=NEW.vehicle_id)); END;`)
}
