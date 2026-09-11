// No database singleton: usable inside the existing billing transaction.
export const temporaryIntake=(db,stopId)=>db.prepare('SELECT * FROM temporary_customer_intakes WHERE dispatch_stop_id=?').get(Number(stopId))
export function intakeEvent(db,id,action,actor,details={}){
 db.prepare('INSERT INTO temporary_customer_intake_events(intake_id,action,actor,details_json) VALUES(?,?,?,?)').run(id,action,String(actor),JSON.stringify(details))
}
export function temporaryProducts(db,stopId){
 const intake=temporaryIntake(db,stopId)
 if(!intake)return null
 const prices=JSON.parse(intake.prices_json||'{}')
 return db.prepare("SELECT p.id productId,p.material_id materialId,p.product_code productCode,p.full_name fullName,p.short_form shortForm,p.unit FROM material_products p JOIN materials m ON m.id=p.material_id WHERE p.status='active' AND m.status='active' ORDER BY p.full_name").all().map(p=>({...p,currentPrice:prices[p.productId]??null,isSelectable:true,priceType:'standard',priceGroupId:null}))
}
export function temporaryPrice(db,stopId,item){
 const products=temporaryProducts(db,stopId)
 if(!products)return null
 const p=products.find(p=>p.productId===Number(item.productId)),raw=item.unitPrice??p?.currentPrice,price=Number(raw)
 if(!p||raw==null||String(raw).trim()===''||!Number.isFinite(price)||price<0||price>100000||Math.abs(price*100-Math.round(price*100))>1e-6){const e=Error('Enter a valid price for this temporary collection.');e.code='INTAKE_PRICE';e.statusCode=400;throw e}
 return {...p,currentPrice:price}
}
export function notifyIntakeBill(db,stopId,billId,items,actor){
 const intake=temporaryIntake(db,stopId)
 if(!intake)return
 db.prepare("UPDATE temporary_customer_intakes SET status=CASE WHEN status='draft' THEN 'pending' ELSE status END,prices_json=? WHERE id=?").run(JSON.stringify(Object.fromEntries(items.map(i=>[i.productId,i.unitPriceCents/100]))),intake.id)
 intakeEvent(db,intake.id,'bill_issued',actor,{billId,prices:items.map(i=>({productId:i.productId,unitPriceCents:i.unitPriceCents,quantity:i.quantity}))})
}

export function assertNoPendingTripApproval(db,tripId){
 if(db.prepare("SELECT 1 FROM driver_defer_requests r JOIN dispatch_stops s ON s.id=r.dispatch_stop_id WHERE s.dispatch_trip_id=? AND r.status='pending'").get(tripId)){
  const e=Error('Wait for supervisor approval before continuing.');e.code='DEFER_APPROVAL_PENDING';e.statusCode=409;throw e
 }
}

export function isAdHocCollection(db,stopId){
 return Boolean(temporaryIntake(db,stopId)||db.prepare("SELECT 1 FROM existing_customer_pickups WHERE dispatch_stop_id=? AND kind IN ('added','transferred')").get(Number(stopId)))
}
