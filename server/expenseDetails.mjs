export const vehicleExpenseCategories=['Fuel','Services','Repair','Spare Parts','Road Tax','Puspakom','Insurance']
const invalid=()=>Object.assign(new Error('EXPENSE_DETAILS_INVALID'),{code:'EXPENSE_DETAILS_INVALID',statusCode:400})
export function expenseVehicles(db){return db.prepare("SELECT id,vehicle_code vehicleCode,registration_number registrationNumber FROM vehicles WHERE operational_status IN ('available','active','maintenance') ORDER BY vehicle_code").all()}
export function normalizeExpenseDetails(payload,db){
 if(Object.hasOwn(payload,'category')&&![...vehicleExpenseCategories,'Other'].includes(payload.category))throw invalid()
 const category=payload.category|| (vehicleExpenseCategories.includes(payload.description)?payload.description:'Other')
 if(![...vehicleExpenseCategories,'Other'].includes(category))throw invalid()
 const vehicleId=payload.vehicleId==null||payload.vehicleId===''?null:Number(payload.vehicleId),vehicle=vehicleId?expenseVehicles(db).find(v=>v.id===vehicleId):null
 const meter=payload.odometerKm==null||String(payload.odometerKm).trim()===''?null:Number(payload.odometerKm)
 const companyName=String(payload.companyName||'').trim(),referenceNumber=String(payload.referenceNumber||'').trim(),tinNumber=String(payload.tinNumber||'').trim(),remarks=String(payload.remarks||'').trim()
 if(vehicleId!==null&&(!Number.isInteger(vehicleId)||!vehicle))throw invalid()
 if(meter!==null&&(!Number.isFinite(meter)||meter<0||meter>10000000))throw invalid()
 if(companyName.length>250||referenceNumber.length>150||tinNumber.length>100||remarks.length>2000)throw invalid()
 if(category!=='Other'&&(!vehicle||meter===null||!referenceNumber||!companyName))throw invalid()
 return{category,description:category==='Other'?(String(payload.description||'').trim()||'Other'):category,vehicleId,vehiclePlate:vehicle?.registrationNumber||vehicle?.vehicleCode||null,odometerKm:meter,companyName,referenceNumber,tinNumber,remarks}
}
export function saveExpenseDetails(db,kind,id,value){db.prepare('INSERT INTO expense_details(employee_transaction_id,admin_expense_id,category,vehicle_id,vehicle_plate,odometer_km,company_name,tin_number,remarks) VALUES(?,?,?,?,?,?,?,?,?)').run(kind==='employee'?id:null,kind==='admin'?id:null,value.category,value.vehicleId,value.vehiclePlate,value.odometerKm,value.companyName||null,value.tinNumber||null,value.remarks||null)}
