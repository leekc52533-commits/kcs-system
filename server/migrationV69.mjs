export const documentNumberSchema=`
CREATE TABLE IF NOT EXISTS document_number_sequences(prefix TEXT NOT NULL CHECK(prefix IN ('P','S','E','V')),number_date TEXT NOT NULL,last_sequence INTEGER NOT NULL CHECK(last_sequence>0),PRIMARY KEY(prefix,number_date));
CREATE TABLE IF NOT EXISTS document_numbers(source_key TEXT PRIMARY KEY,document_number TEXT NOT NULL UNIQUE,prefix TEXT NOT NULL CHECK(prefix IN ('P','S','E','V')),number_date TEXT NOT NULL,sequence INTEGER NOT NULL CHECK(sequence>0),created_at TEXT NOT NULL,UNIQUE(prefix,number_date,sequence));
CREATE TRIGGER IF NOT EXISTS document_numbers_no_update BEFORE UPDATE ON document_numbers BEGIN SELECT RAISE(ABORT,'Document number is permanent'); END;
CREATE TRIGGER IF NOT EXISTS document_numbers_no_delete BEFORE DELETE ON document_numbers BEGIN SELECT RAISE(ABORT,'Document number is permanent'); END;
`
export function applyV69Migration(db){const v=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v);if(v>=69){db.exec(documentNumberSchema);return}if(v!==68)throw Error('Schema 68 required');db.exec('BEGIN IMMEDIATE');try{db.exec(documentNumberSchema);db.exec('INSERT INTO schema_meta(version) VALUES(69)');db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}
