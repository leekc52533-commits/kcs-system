import {kuchingDate} from '../shared/kuchingTime.js'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
export function documentNumber(db,key){if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='document_numbers'").get())return null;return db.prepare('SELECT document_number FROM document_numbers WHERE source_key=?').get(key)?.document_number||null}
export function documentNumberMap(db){if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='document_numbers'").get())return new Map();return new Map(db.prepare('SELECT source_key,document_number FROM document_numbers').all().map(r=>[r.source_key,r.document_number]))}
export function allocateDocumentNumber(db,prefix,key,now=new Date()){
 if(!({P:/^purchase-\d+$/,S:/^sales-\d+$/,E:/^(employee|admin)-\d+$/,V:/^void-\d+$/}[prefix]?.test(key)))throw Error('Invalid document type')
 const instant=new Date(now);if(!Number.isFinite(instant.getTime()))throw Error('Invalid issue time')
 return withImmediateTransaction(db,()=>{
 const existing=documentNumber(db,key);if(existing)return existing
 const date=kuchingDate(instant),n=db.prepare('INSERT INTO document_number_sequences(prefix,number_date,last_sequence) VALUES(?,?,1) ON CONFLICT(prefix,number_date) DO UPDATE SET last_sequence=last_sequence+1 RETURNING last_sequence').get(prefix,date).last_sequence
 const number=prefix+date.replaceAll('-','').slice(2)+'-'+String(n).padStart(3,'0')
 db.prepare('INSERT INTO document_numbers(source_key,document_number,prefix,number_date,sequence,created_at) VALUES(?,?,?,?,?,?)').run(key,number,prefix,date,n,instant.toISOString())
 return number
 })
}
