export const expenseDetailsSchemaSql=`
CREATE TABLE IF NOT EXISTS expense_details (
 id INTEGER PRIMARY KEY,
 employee_transaction_id INTEGER UNIQUE REFERENCES cash_float_transactions(id),
 admin_expense_id INTEGER UNIQUE REFERENCES admin_expense_records(id),
 category TEXT,
 vehicle_id INTEGER REFERENCES vehicles(id),
 vehicle_plate TEXT,
 odometer_km REAL CHECK(odometer_km IS NULL OR odometer_km>=0),
 company_name TEXT,
 tin_number TEXT,
 remarks TEXT,
 CHECK((employee_transaction_id IS NULL)!=(admin_expense_id IS NULL))
);`
export const ensureV56Schema=db=>db.exec(expenseDetailsSchemaSql)
export function applyV56Migration(db){
 const version=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
 if(version>=56){ensureV56Schema(db);return}
 if(version!==55)throw new Error('Schema 55 is required')
 db.exec('BEGIN IMMEDIATE')
 try{ensureV56Schema(db);db.exec('INSERT INTO schema_meta(version) VALUES(56)');if(db.prepare('PRAGMA foreign_key_check').get())throw Error('Foreign key check failed');db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
}
