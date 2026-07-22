export const SCHEMA_VERSION = 16

export const schemaSql = `
CREATE TABLE IF NOT EXISTS schema_meta (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','supervisor','dispatcher','driver','office')),
  password_hash TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS zone_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  source_driver TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jodoo_area_id TEXT UNIQUE,
  name TEXT NOT NULL,
  zone_group_id INTEGER NOT NULL DEFAULT 1 REFERENCES zone_groups(id),
  confirmed_zone_group_id INTEGER REFERENCES zone_groups(id),
  zone_assignment_status TEXT NOT NULL DEFAULT 'pending_confirmation',
  zone_confirmed_by TEXT,
  zone_confirmed_at TEXT,
  schedule_text TEXT,
  default_driver_name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  source_updated_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jodoo_customer_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tin_number TEXT,
  payment_type TEXT CHECK (payment_type IN ('Cash','Credit') OR payment_type IS NULL),
  occ_price REAL,
  legal_name TEXT,
  registration_number TEXT,
  billing_address TEXT,
  contact_person TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  default_payment_type TEXT,
  credit_terms TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  source_system TEXT NOT NULL DEFAULT 'Jodoo',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active INTEGER NOT NULL DEFAULT 1,
  source_updated_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jodoo_branch_id TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  area_id INTEGER REFERENCES areas(id),
  source_customer_id TEXT,
  source_area_id TEXT,
  branch_name TEXT,
  address TEXT,
  latitude REAL CHECK (latitude BETWEEN -90 AND 90 OR latitude IS NULL),
  longitude REAL CHECK (longitude BETWEEN -180 AND 180 OR longitude IS NULL),
  gps_status TEXT,
  gps_verified_at TEXT,
  parking_note TEXT,
  truck_access TEXT,
  gps_remark TEXT,
  time_restriction TEXT,
  contact_person TEXT,
  phone TEXT,
  collection_frequency TEXT,
  assigned_weekdays TEXT,
  occ_price REAL,
  payment_type TEXT,
  proof_requirements TEXT,
  vehicle_restriction TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  source_system TEXT NOT NULL DEFAULT 'Jodoo',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active INTEGER NOT NULL DEFAULT 1,
  source_updated_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS branch_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jodoo_schedule_id TEXT NOT NULL UNIQUE,
  branch_id INTEGER REFERENCES branches(id),
  source_branch_id TEXT NOT NULL,
  frequency TEXT NOT NULL,
  days_of_week TEXT,
  take_date TEXT,
  next_take_date TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  source_updated_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS operational_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_code TEXT UNIQUE,
  name TEXT NOT NULL,
  location_type TEXT NOT NULL CHECK (location_type IN ('depot','parking','employee_home','factory','temporary','other')),
  address TEXT,
  latitude REAL,
  longitude REAL,
  operational_type TEXT,
  operating_hours TEXT,
  contact_person TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  buyer_id INTEGER REFERENCES buyers(id),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  can_start INTEGER NOT NULL DEFAULT 0,
  can_end INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_code TEXT UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  job_role TEXT,
  home_location_id INTEGER REFERENCES operational_locations(id),
  employment_status TEXT NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active','on_leave','inactive')),
  employment_detail_status TEXT,
  employment_type TEXT NOT NULL DEFAULT 'Permanent',
  employment_start_date TEXT,
  employment_end_date TEXT,
  last_working_day TEXT,
  resignation_termination_reason TEXT,
  national_id_number TEXT,
  bank_name TEXT,
  bank_account_number TEXT,
  bank_account_holder_name TEXT,
  epf_number TEXT,
  socso_number TEXT,
  default_base_location_id INTEGER REFERENCES operational_locations(id),
  default_area_id INTEGER REFERENCES areas(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL UNIQUE REFERENCES employees(id),
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','supervisor','office','driver','crew')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK(must_change_password IN (0,1)),
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  password_changed_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  disabled_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employee_job_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('Driver','Attendant / Crew','Supervisor','Office','Admin','Mechanic / Workshop','Other')),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id,role)
);

CREATE TABLE IF NOT EXISTS employee_role_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  old_roles_json TEXT,
  new_roles_json TEXT NOT NULL,
  reason TEXT,
  changed_by TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employee_familiar_areas (
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  area_id INTEGER NOT NULL REFERENCES areas(id),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(employee_id,area_id)
);

CREATE TABLE IF NOT EXISTS employee_change_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employee_employment_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  start_date TEXT,
  end_date TEXT,
  last_working_day TEXT,
  employment_status TEXT NOT NULL,
  employment_type TEXT NOT NULL,
  primary_job_role TEXT,
  secondary_job_roles TEXT,
  resignation_or_termination_reason TEXT,
  rehire_flag INTEGER NOT NULL DEFAULT 0 CHECK(rehire_flag IN (0,1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employee_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  document_type TEXT NOT NULL CHECK(document_type IN ('ic_front','ic_back')),
  storage_key TEXT NOT NULL,
  original_name TEXT,
  content_type TEXT,
  uploaded_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  replaced_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1))
);

CREATE TABLE IF NOT EXISTS employee_sensitive_access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  account_id INTEGER REFERENCES auth_accounts(id),
  action TEXT NOT NULL,
  field_name TEXT NOT NULL,
  reason TEXT,
  actor TEXT NOT NULL,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_account_permissions (
  account_id INTEGER NOT NULL REFERENCES auth_accounts(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(account_id,permission)
);

CREATE TABLE IF NOT EXISTS employee_import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'previewed',
  summary_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  committed_by TEXT,
  committed_at TEXT
);

CREATE TABLE IF NOT EXISTS employee_import_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES employee_import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  employee_id INTEGER REFERENCES employees(id),
  classification TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  error_message TEXT,
  UNIQUE(batch_id,row_number)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES auth_accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS auth_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER REFERENCES auth_accounts(id),
  employee_id INTEGER REFERENCES employees(id),
  username TEXT,
  action TEXT NOT NULL,
  success INTEGER NOT NULL CHECK(success IN (0,1)),
  ip_address TEXT,
  user_agent TEXT,
  detail_json TEXT,
  actor TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_code TEXT NOT NULL UNIQUE,
  vehicle_name TEXT,
  registration_number TEXT,
  capacity_kg REAL,
  official_sequence INTEGER,
  brand TEXT,
  model TEXT,
  manufacture_year INTEGER,
  registration_date TEXT,
  vehicle_type TEXT,
  chassis_number TEXT,
  engine_number TEXT,
  gross_vehicle_weight_kg REAL,
  unladen_weight_kg REAL,
  operational_status TEXT NOT NULL DEFAULT 'active',
  is_common INTEGER NOT NULL DEFAULT 1,
  remark TEXT,
  sold_at TEXT,
  default_base_location_id INTEGER REFERENCES operational_locations(id),
  default_start_location_id INTEGER REFERENCES operational_locations(id),
  default_end_location_id INTEGER REFERENCES operational_locations(id),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','assigned','maintenance','inactive')),
  is_temporary INTEGER NOT NULL DEFAULT 0 CHECK (is_temporary IN (0,1)),
  temporary_date TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dispatches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dispatch_date TEXT NOT NULL,
  vehicle_id INTEGER REFERENCES vehicles(id),
  driver_id INTEGER REFERENCES employees(id),
  driver_employment_period_id INTEGER REFERENCES employee_employment_history(id),
  assistant_id INTEGER REFERENCES employees(id),
  assistant_employment_period_id INTEGER REFERENCES employee_employment_history(id),
  start_location_id INTEGER REFERENCES operational_locations(id),
  end_location_id INTEGER REFERENCES operational_locations(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','released','in_progress','completed','cancelled')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dispatch_stops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dispatch_id INTEGER NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  stop_sequence INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked','available','active','completed','overridden','cancelled')),
  arrived_at TEXT,
  completed_at TEXT,
  collected_weight_kg REAL,
  invoice_number TEXT,
  payment_status TEXT,
  override_reason TEXT,
  override_note TEXT,
  override_by INTEGER REFERENCES users(id),
  override_at TEXT,
  dispatch_trip_id INTEGER REFERENCES dispatch_trips(id),
  source_schedule_id INTEGER REFERENCES branch_schedules(id),
  source_special_request_id INTEGER REFERENCES special_collection_requests(id),
  estimated_weight_kg REAL,
  sequence_locked INTEGER NOT NULL DEFAULT 0,
  zone_group_id_snapshot INTEGER,
  zone_group_name_snapshot TEXT,
  area_name_snapshot TEXT,
  UNIQUE(dispatch_id, stop_sequence)
);

CREATE TABLE IF NOT EXISTS stop_step_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dispatch_stop_id INTEGER NOT NULL REFERENCES dispatch_stops(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  completed_by INTEGER REFERENCES users(id),
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload_json TEXT,
  UNIQUE(dispatch_stop_id, step_key)
);

CREATE TABLE IF NOT EXISTS stop_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dispatch_stop_id INTEGER NOT NULL REFERENCES dispatch_stops(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending','synced','failed'))
);

CREATE TABLE IF NOT EXISTS import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL DEFAULT 'jodoo_excel',
  status TEXT NOT NULL CHECK (status IN ('preview','approved','importing','completed','failed')),
  file_manifest_json TEXT NOT NULL,
  summary_json TEXT,
  approved_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS import_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_batch_id INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  severity TEXT NOT NULL CHECK (severity IN ('warning','error')),
  entity_type TEXT NOT NULL,
  external_id TEXT,
  message TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS import_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_batch_id INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  sheet_name TEXT,
  file_type TEXT,
  content_hash TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  headers_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_staged_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_batch_id INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  import_file_id INTEGER REFERENCES import_files(id) ON DELETE CASCADE,
  file_type TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  external_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('new','update','unchanged','error','unmatched')),
  normalized_json TEXT NOT NULL,
  source_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_batch_id INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  import_file_id INTEGER REFERENCES import_files(id) ON DELETE CASCADE,
  row_number INTEGER,
  entity_type TEXT NOT NULL,
  external_id TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('warning','error','fatal')),
  error_code TEXT NOT NULL,
  message TEXT NOT NULL,
  source_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS jodoo_sync_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT UNIQUE,
  event_type TEXT NOT NULL,
  form_id TEXT,
  data_id TEXT,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','processed','ignored','failed')),
  error_message TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT
);

CREATE TABLE IF NOT EXISTS jodoo_outbox_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT NOT NULL CHECK (job_type IN ('upload_stop_photos','upload_no_collection','update_record')),
  dispatch_stop_id INTEGER REFERENCES dispatch_stops(id) ON DELETE CASCADE,
  jodoo_data_id TEXT,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','succeeded','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS weekly_dispatch_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  generated_by TEXT,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dispatch_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  weekly_plan_id INTEGER NOT NULL REFERENCES weekly_dispatch_plans(id) ON DELETE CASCADE,
  dispatch_date TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','published','in_progress','completed','reapproval_required')),
  revision INTEGER NOT NULL DEFAULT 1,
  approved_revision INTEGER,
  published_at TEXT,
  published_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dispatch_trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dispatch_day_id INTEGER NOT NULL REFERENCES dispatch_days(id) ON DELETE CASCADE,
  dispatch_id INTEGER NOT NULL UNIQUE REFERENCES dispatches(id) ON DELETE CASCADE,
  trip_number INTEGER NOT NULL DEFAULT 1,
  area_id INTEGER REFERENCES areas(id),
  estimated_weight_kg REAL,
  warning_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_preferred_areas (
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  area_id INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  PRIMARY KEY(vehicle_id, area_id)
);

CREATE TABLE IF NOT EXISTS vehicle_preferred_zones (
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  zone_group_id INTEGER NOT NULL REFERENCES zone_groups(id),
  PRIMARY KEY(vehicle_id, zone_group_id)
);

CREATE TABLE IF NOT EXISTS vehicle_compliance_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL UNIQUE REFERENCES vehicles(id),
  puspakom_due_date TEXT,
  road_tax_due_date TEXT,
  insurance_due_date TEXT,
  loan_payment_due_date TEXT,
  next_service_date TEXT,
  next_service_mileage REAL,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_maintenance_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  maintenance_date TEXT NOT NULL,
  mileage REAL,
  fault_description TEXT,
  repair_work TEXT,
  parts_replaced TEXT,
  workshop TEXT,
  labour_cost REAL NOT NULL DEFAULT 0,
  parts_cost REAL NOT NULL DEFAULT 0,
  total_cost REAL NOT NULL DEFAULT 0,
  invoice_storage_key TEXT,
  invoice_original_name TEXT,
  before_photo_storage_key TEXT,
  before_photo_original_name TEXT,
  after_photo_storage_key TEXT,
  after_photo_original_name TEXT,
  downtime_start TEXT,
  downtime_end TEXT,
  approved_by TEXT,
  follow_up_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_fuel_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  fuel_at TEXT NOT NULL,
  driver_id INTEGER REFERENCES employees(id),
  mileage REAL,
  fuel_station TEXT,
  litres REAL,
  price_per_litre REAL,
  total_amount REAL,
  receipt_storage_key TEXT,
  receipt_original_name TEXT,
  full_tank INTEGER NOT NULL DEFAULT 0 CHECK(full_tank IN (0,1)),
  related_dispatch_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_tyre_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  tyre_position TEXT NOT NULL,
  brand TEXT,
  install_date TEXT,
  install_mileage REAL,
  cost REAL,
  repair_rotation_history TEXT,
  replacement_date TEXT,
  photo_storage_key TEXT,
  photo_original_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  document_type TEXT NOT NULL,
  title TEXT,
  storage_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  document_date TEXT,
  expiry_date TEXT,
  uploaded_by TEXT,
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  previous_status TEXT,
  new_status TEXT NOT NULL,
  reason TEXT,
  changed_by TEXT,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_usage_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  driver_id INTEGER REFERENCES employees(id),
  dispatch_date TEXT NOT NULL,
  trips_completed INTEGER NOT NULL DEFAULT 0,
  collection_weight_kg REAL,
  kilometres REAL,
  fuel_cost REAL,
  downtime_hours REAL,
  incidents TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(vehicle_id, dispatch_date)
);

CREATE TABLE IF NOT EXISTS dispatch_vehicle_assistants (
  dispatch_day_id INTEGER NOT NULL REFERENCES dispatch_days(id) ON DELETE CASCADE,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  employment_period_id INTEGER REFERENCES employee_employment_history(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(dispatch_day_id, vehicle_id, employee_id)
);

CREATE TABLE IF NOT EXISTS dispatch_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dispatch_day_id INTEGER NOT NULL REFERENCES dispatch_days(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('approve','publish','reapprove','reopen')),
  revision INTEGER NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dispatch_change_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dispatch_day_id INTEGER REFERENCES dispatch_days(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  change_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  requires_reapproval INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS special_collection_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_type TEXT NOT NULL CHECK (request_type IN ('existing','potential_new')),
  existing_branch_id INTEGER REFERENCES branches(id),
  temporary_customer_name TEXT,
  contact_person TEXT,
  phone TEXT,
  whatsapp TEXT,
  address TEXT,
  location_link TEXT,
  temporary_latitude REAL,
  temporary_longitude REAL,
  location_source TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  requested_collection_date TEXT NOT NULL,
  estimated_weight_kg REAL,
  special_requirement TEXT,
  created_by TEXT NOT NULL,
  promised_to_customer INTEGER NOT NULL DEFAULT 0 CHECK (promised_to_customer IN (0,1)),
  remark TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','awaiting_supervisor','awaiting_customer_account','scheduled','approved','published','completed','rejected','cancelled')),
  account_status TEXT,
  linked_customer_id TEXT,
  linked_branch_id TEXT,
  occ_price REAL,
  payment_type TEXT,
  scheduled_date TEXT,
  vehicle_id INTEGER REFERENCES vehicles(id),
  trip_number INTEGER,
  completion_status TEXT,
  approved_by TEXT,
  approved_at TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schedule_exceptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER REFERENCES branches(id),
  schedule_id INTEGER REFERENCES branch_schedules(id),
  exception_type TEXT NOT NULL CHECK (exception_type IN ('move_date','cancel_date','add_extra_collection','pause_once','resume','customer_request')),
  original_date TEXT,
  target_date TEXT,
  permanent INTEGER NOT NULL DEFAULT 0 CHECK (permanent IN (0,1)),
  reason TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS temporary_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  special_request_id INTEGER REFERENCES special_collection_requests(id) ON DELETE CASCADE,
  branch_id INTEGER REFERENCES branches(id),
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  location_source TEXT NOT NULL,
  location_link TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  distance_from_official_m REAL,
  captured_by TEXT,
  captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accuracy_m REAL,
  device_captured_at TEXT,
  server_received_at TEXT,
  employee_id INTEGER REFERENCES employees(id),
  employment_period_id INTEGER REFERENCES employee_employment_history(id),
  dispatch_id INTEGER REFERENCES dispatches(id),
  dispatch_stop_id INTEGER REFERENCES dispatch_stops(id),
  photo_storage_key TEXT,
  photo_original_name TEXT,
  photo_content_type TEXT,
  remark TEXT,
  review_decision TEXT,
  review_reason TEXT,
  reviewed_by_account_id INTEGER REFERENCES auth_accounts(id),
  reviewed_by TEXT,
  reviewed_at TEXT,
  adopted_by TEXT,
  adopted_at TEXT
);

CREATE TABLE IF NOT EXISTS gps_migration_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'previewed',
  summary_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  committed_at TEXT
);

CREATE TABLE IF NOT EXISTS gps_migration_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES gps_migration_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  branch_id_text TEXT,
  customer_id_text TEXT,
  customer_name TEXT,
  branch_name TEXT,
  latitude REAL,
  longitude REAL,
  old_latitude REAL,
  old_longitude REAL,
  classification TEXT NOT NULL,
  decision TEXT,
  decision_reason TEXT,
  decided_by TEXT,
  decided_at TEXT,
  raw_json TEXT,
  UNIQUE(batch_id,row_number)
);

CREATE TABLE IF NOT EXISTS zone_boundaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_group_id INTEGER NOT NULL REFERENCES zone_groups(id),
  boundary_version INTEGER NOT NULL,
  polygon_json TEXT,
  center_latitude REAL,
  center_longitude REAL,
  effective_date TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(zone_group_id,boundary_version)
);

CREATE TABLE IF NOT EXISTS gps_zone_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL UNIQUE REFERENCES branches(id) ON DELETE CASCADE,
  official_latitude REAL,
  official_longitude REAL,
  current_area_id INTEGER REFERENCES areas(id),
  current_zone_group_id INTEGER REFERENCES zone_groups(id),
  recommended_area_id INTEGER REFERENCES areas(id),
  recommended_zone_group_id INTEGER REFERENCES zone_groups(id),
  boundary_id INTEGER REFERENCES zone_boundaries(id),
  match_type TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK(confidence IN ('high','medium','low','none')),
  boundary_conflict INTEGER NOT NULL DEFAULT 0 CHECK(boundary_conflict IN (0,1)),
  nearest_distance_m REAL,
  reason_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','kept_original','selected_other','later','no_gps')),
  calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by TEXT,
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS gps_zone_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recommendation_id INTEGER REFERENCES gps_zone_recommendations(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  decision TEXT NOT NULL,
  old_area_id INTEGER REFERENCES areas(id),
  new_area_id INTEGER REFERENCES areas(id),
  old_zone_group_id INTEGER REFERENCES zone_groups(id),
  new_zone_group_id INTEGER REFERENCES zone_groups(id),
  official_latitude REAL,
  official_longitude REAL,
  recommendation_reason_json TEXT,
  confirmed_by TEXT NOT NULL,
  confirmed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS buyers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_code TEXT NOT NULL UNIQUE,
  buyer_name TEXT NOT NULL,
  location_name TEXT,
  address TEXT,
  latitude REAL,
  longitude REAL,
  contact_person TEXT,
  phone TEXT,
  material_accepted TEXT,
  operating_hours TEXT,
  unloading_restrictions TEXT,
  pricing_notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS master_change_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  change_type TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  changed_by TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS data_transfer_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_type TEXT NOT NULL,
  module TEXT NOT NULL,
  file_name TEXT,
  file_format TEXT,
  scope_json TEXT,
  summary_json TEXT,
  performed_by TEXT NOT NULL,
  performed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS branches_customer_idx ON branches(customer_id);
CREATE INDEX IF NOT EXISTS branches_area_idx ON branches(area_id);
CREATE INDEX IF NOT EXISTS schedules_branch_idx ON branch_schedules(branch_id);
CREATE INDEX IF NOT EXISTS dispatches_date_idx ON dispatches(dispatch_date);
CREATE INDEX IF NOT EXISTS stops_dispatch_idx ON dispatch_stops(dispatch_id, stop_sequence);
CREATE INDEX IF NOT EXISTS sync_status_idx ON jodoo_sync_events(status, received_at);
CREATE INDEX IF NOT EXISTS jodoo_outbox_pending_idx ON jodoo_outbox_jobs(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS import_errors_batch_idx ON import_errors(import_batch_id, severity);
CREATE INDEX IF NOT EXISTS import_staged_batch_idx ON import_staged_rows(import_batch_id, file_type, action);
CREATE INDEX IF NOT EXISTS dispatch_days_date_idx ON dispatch_days(dispatch_date, status);
CREATE INDEX IF NOT EXISTS dispatch_trips_day_idx ON dispatch_trips(dispatch_day_id, trip_number);
CREATE INDEX IF NOT EXISTS dispatch_vehicle_assistants_employee_idx ON dispatch_vehicle_assistants(employee_id, dispatch_day_id);
CREATE INDEX IF NOT EXISTS special_requests_date_idx ON special_collection_requests(requested_collection_date, status);
CREATE INDEX IF NOT EXISTS schedule_exceptions_dates_idx ON schedule_exceptions(original_date, target_date);
CREATE INDEX IF NOT EXISTS vehicle_maintenance_vehicle_idx ON vehicle_maintenance_records(vehicle_id, maintenance_date DESC);
CREATE INDEX IF NOT EXISTS vehicle_fuel_vehicle_idx ON vehicle_fuel_records(vehicle_id, fuel_at DESC);
CREATE INDEX IF NOT EXISTS vehicle_tyre_vehicle_idx ON vehicle_tyre_records(vehicle_id, install_date DESC);
CREATE INDEX IF NOT EXISTS vehicle_documents_vehicle_idx ON vehicle_documents(vehicle_id, document_type);
CREATE INDEX IF NOT EXISTS vehicle_status_history_vehicle_idx ON vehicle_status_history(vehicle_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS vehicle_usage_vehicle_idx ON vehicle_usage_history(vehicle_id, dispatch_date DESC);
CREATE INDEX IF NOT EXISTS zone_boundaries_zone_idx ON zone_boundaries(zone_group_id,is_active,effective_date);
CREATE INDEX IF NOT EXISTS gps_recommendations_status_idx ON gps_zone_recommendations(status,confidence,boundary_conflict);
CREATE INDEX IF NOT EXISTS gps_zone_decisions_branch_idx ON gps_zone_decisions(branch_id,confirmed_at DESC);
CREATE INDEX IF NOT EXISTS buyers_status_idx ON buyers(status,buyer_name);
CREATE INDEX IF NOT EXISTS master_change_history_entity_idx ON master_change_history(entity_type,entity_id,changed_at DESC);
CREATE INDEX IF NOT EXISTS data_transfer_logs_module_idx ON data_transfer_logs(module,performed_at DESC);

INSERT OR IGNORE INTO zone_groups(id,code,name,sort_order) VALUES
  (1,'KUCHING-A','古晋 A区',1),
  (2,'KUCHING-B','古晋 B区',2),
  (3,'SERIAN-A','西连 A区',3),
  (4,'SERIAN-B','西连 B区',4),
  (5,'SAMARAHAN-A','Samarahan A区',5),
  (6,'SAMARAHAN-B','Samarahan B区',6),
  (7,'LUNDU-BAU','伦乐 / 石隆门区',7);

CREATE TRIGGER IF NOT EXISTS sold_vehicle_no_delete BEFORE DELETE ON vehicles
WHEN OLD.operational_status='sold' BEGIN SELECT RAISE(ABORT,'Sold vehicle history cannot be deleted'); END;
`
