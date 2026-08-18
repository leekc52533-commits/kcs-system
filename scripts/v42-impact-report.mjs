import {DatabaseSync} from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

if(!process.env.KCS_DB_PATH)throw new Error('KCS_DB_PATH is required; no database path is inferred')
const args=process.argv.slice(2),value=name=>{const i=args.indexOf(name);return i<0?null:args[i+1]}
const databasePath=path.resolve(process.env.KCS_DB_PATH)
if(!fs.existsSync(databasePath))throw new Error(`Database not found: ${databasePath}`)
const db=new DatabaseSync(databasePath,{readOnly:true})
let report
try{
  const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version!==41)throw new Error(`Impact report requires exact schema v41, found v${version}`)
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').get())throw new Error('Database integrity or foreign-key check failed')
  const rows=db.prepare(`SELECT cmp.id pricingId,c.jodoo_customer_id customerId,c.name customerName,m.id materialId,m.material_code materialCode,cmp.outstation_enabled outstationEnabled,
    COUNT(DISTINCT s.price_type) selectionTypeCount,MIN(s.price_type) unanimousType
    FROM customer_material_pricing cmp JOIN customers c ON c.id=cmp.customer_id JOIN materials m ON m.id=cmp.material_id
    LEFT JOIN branches b ON b.customer_id=cmp.customer_id LEFT JOIN branch_material_price_selections s ON s.branch_id=b.id AND s.material_id=cmp.material_id
    WHERE cmp.status='active' GROUP BY cmp.id ORDER BY c.jodoo_customer_id,m.material_code,cmp.id`).all()
  const items=rows.map(row=>{let state='ready',priceType='standard',reason='outstation_disabled';if(row.outstationEnabled){if(row.selectionTypeCount===0){state='review_required';reason='missing_legacy_selection'}else if(row.selectionTypeCount>1){state='review_required';reason='conflicting_legacy_types'}else{priceType=row.unanimousType;reason=`unanimous_${row.unanimousType}`}}return{...row,outstationEnabled:Boolean(row.outstationEnabled),state,priceType,reason}})
  const groups=Object.fromEntries([...new Set(items.map(item=>item.reason))].sort().map(reason=>[reason,items.filter(item=>item.reason===reason).length]))
  report={schemaVersion:41,total:items.length,ready:items.filter(item=>item.state==='ready').length,reviewRequired:items.filter(item=>item.state==='review_required').length,groups,items}
}finally{db.close()}
const output=value('--output');if(output)fs.writeFileSync(path.resolve(output),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600})
console.log(JSON.stringify(report,null,2))
const unresolved=report.items.filter(item=>item.state==='review_required').map(item=>item.pricingId).sort((a,b)=>a-b)
if(unresolved.length){const override=value('--review-override');if(!override)throw new Error(`Migration impact has ${unresolved.length} review_required row(s); separately reviewed override is required`);const approval=JSON.parse(fs.readFileSync(path.resolve(override),'utf8')),approved=(approval.approvedPricingIds||[]).map(Number).sort((a,b)=>a-b);if(approval.schemaVersion!==41||!String(approval.reviewedBy||'').trim()||!String(approval.reason||'').trim()||JSON.stringify(approved)!==JSON.stringify(unresolved))throw new Error('Review override does not exactly approve the unresolved pricing identifiers')}
