import {DatabaseSync} from 'node:sqlite'
import {assignActiveCustomersToProductPriceGroup} from '../server/materialCatalogService.mjs'

const args=process.argv.slice(2)
const valueFor=name=>{const index=args.indexOf(name);return index<0?null:args[index+1]}
const apply=args.includes('--apply')
const productCode=String(valueFor('--product-code')||'').trim().toUpperCase()
const requestedPrice=valueFor('--price')
const databasePath=process.env.KCS_DB_PATH

if(!databasePath)throw new Error('KCS_DB_PATH is required')
if(!productCode)throw new Error('--product-code is required')
if(requestedPrice!=null&&(!Number.isFinite(Number(requestedPrice))||Number(requestedPrice)<=0))throw new Error('--price must be greater than zero')

const database=new DatabaseSync(databasePath)
database.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;')
try{
  const schemaVersion=Number(database.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(schemaVersion!==42)throw new Error(`Expected Schema v42, found v${schemaVersion}`)
  if(database.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Database integrity check failed')
  if(database.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Database foreign key check failed')
  const product=database.prepare("SELECT id,product_code,full_name,status FROM material_products WHERE UPPER(TRIM(product_code))=? AND visibility_status<>'hidden'").get(productCode)
  if(!product)throw new Error(`Product ${productCode} was not found`)
  if(product.status!=='active')throw new Error(`Product ${productCode} is not Active`)
  const groups=database.prepare("SELECT id,price_amount,status,effective_date FROM material_price_levels WHERE product_id=? AND visibility_status<>'hidden' ORDER BY id").all(product.id)
  const matching=requestedPrice==null?groups:groups.filter(group=>Math.round(Number(group.price_amount)*100)===Math.round(Number(requestedPrice)*100))
  if(matching.length!==1)throw new Error(`Expected exactly one matching Price Group for ${productCode}, found ${matching.length}`)
  const group=matching[0]
  if(group.status!=='active')throw new Error('Target Price Group is not Active')
  const activeCustomers=Number(database.prepare("SELECT COUNT(*) count FROM customers WHERE status='active'").get().count)
  const existingRows=database.prepare('SELECT * FROM customer_product_pricing WHERE product_id=? ORDER BY id').all(product.id)
  const targetCustomers=Number(database.prepare(`SELECT COUNT(*) count FROM customers c WHERE c.status='active' AND NOT EXISTS(
    SELECT 1 FROM customer_product_pricing cpp WHERE cpp.customer_id=c.id AND cpp.product_id=? AND cpp.status='active'
  )`).get(product.id).count)
  const runId=`assign-${productCode.toLowerCase()}-${group.id}-${new Date().toISOString().replace(/[-:.]/g,'')}`
  const preview={databasePath,schemaVersion,mode:apply?'APPLY':'DRY_RUN',product:{id:product.id,code:product.product_code,name:product.full_name},priceGroup:{id:group.id,price:Number(group.price_amount),effectiveDate:group.effective_date},activeCustomers,existingProductPricingRows:existingRows.length,targetCustomers}
  if(!apply)console.log(JSON.stringify(preview,null,2))
  else{
    const result=assignActiveCustomersToProductPriceGroup(group.id,{changedBy:'Approved Product Customer Assignment',reason:`Assign ${productCode} first Price Group to all Active Customers`,runId},database)
    const finalConnections=Number(database.prepare("SELECT COUNT(*) count FROM customer_product_pricing cpp JOIN customers c ON c.id=cpp.customer_id WHERE cpp.product_id=? AND cpp.status='active' AND c.status='active'").get(product.id).count)
    const missing=Number(database.prepare(`SELECT COUNT(*) count FROM customers c WHERE c.status='active' AND NOT EXISTS(
      SELECT 1 FROM customer_product_pricing cpp WHERE cpp.customer_id=c.id AND cpp.product_id=? AND cpp.status='active'
    )`).get(product.id).count)
    const existingChanged=existingRows.some(before=>JSON.stringify(before)!==JSON.stringify(database.prepare('SELECT * FROM customer_product_pricing WHERE id=?').get(before.id)))
    const auditRecords=Number(database.prepare("SELECT COUNT(*) count FROM material_conversion_audit WHERE run_id=?").get(runId).count)
    if(result.changedCustomers!==targetCustomers||missing!==0||existingChanged||auditRecords!==targetCustomers)throw new Error(`Post-write guard failed: changed=${result.changedCustomers}, target=${targetCustomers}, missing=${missing}, existingChanged=${existingChanged}, audit=${auditRecords}`)
    console.log(JSON.stringify({...preview,ok:true,...result,finalConnections,protectedExistingRowsUnchanged:true,auditRecords},null,2))
  }
}finally{database.close()}
