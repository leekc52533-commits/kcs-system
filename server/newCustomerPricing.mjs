import {applyDueOccPrices} from './occCurrentPrices.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'
import {saveCustomerProductPricing} from './materialProductService.mjs'
export function newCustomerPricing(db,today=kuchingDate()){
 applyDueOccPrices(db,today)
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='material_products'").get())return []
 const levels=db.prepare("SELECT id,product_id productId,price_amount price FROM material_price_levels WHERE status='active' AND visibility_status='active' AND price_amount>0 AND effective_date<=? ORDER BY price_amount,id").all(today)
 return db.prepare("SELECT p.id productId,p.product_code productCode,p.full_name name,p.unit FROM material_products p JOIN materials m ON m.id=p.material_id WHERE p.status='active' AND p.visibility_status='active' AND m.status='active' ORDER BY p.full_name COLLATE NOCASE,p.id").all().map(p=>{const prices=levels.filter(l=>l.productId===p.productId),requiresChoice=p.productCode.toUpperCase()==='OCC'||prices.length>1;return {...p,prices,requiresChoice,standardPriceLevelId:!requiresChoice&&prices.length===1?prices[0].id:null}})
}
export function applyNewCustomerPricing(db,customerId,selections=[],actor='Supervisor',reason='New customer pricing'){
 const catalog=newCustomerPricing(db),chosen=new Map()
 if(!Array.isArray(selections))throw Error('Invalid product price selections')
 for(const row of selections){const id=Number(row.productId);if(chosen.has(id)||!catalog.some(p=>p.productId===id))throw Error('Invalid product price selections');chosen.set(id,Number(row.standardPriceLevelId))}
 const items=catalog.filter(p=>p.prices.length).map(p=>{
  const id=chosen.get(p.productId)||p.standardPriceLevelId
  if(!p.prices.some(l=>l.id===id))throw Object.assign(Error(`Select a valid price: ${p.name}`),{code:'CUSTOMER_PRICE_SELECTION_REQUIRED',statusCode:400})
  return {productId:p.productId,standardPriceLevelId:id,outstationEnabled:false}
 })
 return saveCustomerProductPricing(customerId,items,{changedBy:actor,reason:reason||'New customer pricing',manageTransaction:false},db)
}
