const clean=value=>String(value??'').trim()
const coordinates=(latitude,longitude)=>{const lat=Number(latitude),lng=Number(longitude);if(!Number.isFinite(lat)||lat < -90||lat > 90||!Number.isFinite(lng)||lng < -180||lng > 180)throw new Error('Start Location requires valid GPS');return{latitude:lat,longitude:lng}}
const snapshot=(type,referenceType,referenceId,row)=>({
  startLocationType:type,startLocationReferenceType:referenceType,startLocationReferenceId:referenceId??null,
  startLocationName:clean(row.name),startAddress:clean(row.address)||null,startLatitude:Number(row.latitude),startLongitude:Number(row.longitude),
  startLocationId:referenceType==='operational_location'?Number(referenceId):null
})

export function companyYard(database){
  const rows=database.prepare(`SELECT id,name,address,latitude,longitude FROM operational_locations WHERE operational_type='Company Yard' AND is_active=1 AND COALESCE(status,'active')='active' AND can_start=1 AND latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY id`).all()
  if(rows.length!==1)throw new Error(rows.length?'Multiple active Company Yard start locations are configured':'Company Yard GPS is not set')
  return rows[0]
}

export function resolveStartLocation(selection={},context={},database){
  const type=clean(selection.type||selection.startLocationType||'factory').toLowerCase()
  if(type==='factory'){const yard=companyYard(database);return snapshot('factory','operational_location',yard.id,yard)}
  if(type==='employee_home'){
    if(!context.canViewEmployeeHome)throw Object.assign(new Error('Employee Home location permission is required'),{status:403})
    const employeeId=Number(selection.referenceId||selection.employeeId||context.driverId);if(!employeeId)throw new Error('Select a Driver before Employee Home')
    const employee=database.prepare(`SELECT id,name,home_address address,home_latitude latitude,home_longitude longitude FROM employees WHERE id=? AND is_active=1 AND employment_status='active'`).get(employeeId)
    if(!employee)throw new Error('Employee was not found');if(employee.latitude==null||employee.longitude==null)throw new Error('Home GPS Not Set')
    coordinates(employee.latitude,employee.longitude);return snapshot('employee_home','employee',employee.id,employee)
  }
  if(type==='saved_location'){
    const referenceType=clean(selection.referenceType||selection.startLocationReferenceType),referenceId=Number(selection.referenceId||selection.startLocationReferenceId);if(!referenceId)throw new Error('Select a Saved Location')
    let row
    if(referenceType==='customer_branch')row=database.prepare(`SELECT b.id,c.name||' — '||b.branch_name name,b.address,b.latitude,b.longitude FROM branches b JOIN customers c ON c.id=b.customer_id WHERE b.id=? AND b.lifecycle_status='ACTIVE' AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL`).get(referenceId)
    else if(referenceType==='operational_location')row=database.prepare(`SELECT id,name,address,latitude,longitude FROM operational_locations WHERE id=? AND is_active=1 AND COALESCE(status,'active')='active' AND latitude IS NOT NULL AND longitude IS NOT NULL`).get(referenceId)
    else throw new Error('Invalid Saved Location type')
    if(!row)throw new Error('Saved Location GPS is not available');coordinates(row.latitude,row.longitude);return snapshot('saved_location',referenceType,row.id,row)
  }
  if(type==='custom'){
    const point=coordinates(selection.latitude,selection.longitude),name=clean(selection.name)||'Custom Location',address=clean(selection.address)
    if(!address)throw new Error('Custom Location Address is required')
    return snapshot('custom','custom',null,{name,address,...point})
  }
  throw new Error('Invalid Start Location type')
}

export function startLocationOptions({driverId=null,includeEmployeeHome=false}={},database){
  let factory=null;try{const yard=companyYard(database);factory=snapshot('factory','operational_location',yard.id,yard)}catch{}
  const operational=database.prepare(`SELECT id,name,address,latitude,longitude,operational_type locationType FROM operational_locations WHERE is_active=1 AND COALESCE(status,'active')='active' AND latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY name`).all().map(row=>({...snapshot('saved_location','operational_location',row.id,row),locationType:row.locationType}))
  const branches=database.prepare(`SELECT b.id,c.name customerName,b.branch_name name,b.address,b.latitude,b.longitude FROM branches b JOIN customers c ON c.id=b.customer_id WHERE b.lifecycle_status='ACTIVE' AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL ORDER BY c.name,b.branch_name`).all().map(row=>({...snapshot('saved_location','customer_branch',row.id,row),customerName:row.customerName}))
  let employeeHome=null;if(includeEmployeeHome&&driverId){const employee=database.prepare('SELECT id,name,home_address address,home_latitude latitude,home_longitude longitude FROM employees WHERE id=? AND is_active=1').get(Number(driverId));employeeHome=employee&&employee.latitude!=null&&employee.longitude!=null?snapshot('employee_home','employee',employee.id,employee):{available:false,message:'Home GPS Not Set'}}
  return{factory,employeeHome,savedLocations:[...operational,...branches]}
}

export function writeStartLocationSnapshot(database,dispatchId,value){
  database.prepare(`UPDATE dispatches SET start_location_id=?,start_location_type=?,start_location_reference_type=?,start_location_reference_id=?,start_location_name=?,start_address=?,start_latitude=?,start_longitude=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(value.startLocationId,value.startLocationType,value.startLocationReferenceType,value.startLocationReferenceId,value.startLocationName,value.startAddress,value.startLatitude,value.startLongitude,dispatchId)
}
