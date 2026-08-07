export const VEHICLE_REGISTRATION_FIELDS=new Set(['vehicleCode','registrationNumber','registrationPlate','vehicleName','brand','model','manufactureYear','registrationDate','vehicleType','chassisNumber','engineNumber','registeredOwner','fuelType','engineCapacityCc','vehicleOrigin','vehicleClass','grossVehicleWeightKg','unladenWeightKg'])
export const vehicleRegistrationFieldsInPayload=payload=>Object.keys(payload||{}).filter(key=>VEHICLE_REGISTRATION_FIELDS.has(key))
export function assertVehicleRegistrationEdit(session,payload){
  const fields=vehicleRegistrationFieldsInPayload(payload);if(!fields.length)return fields
  if(String(session?.role||'').trim().toLowerCase()!=='owner_admin'){const error=new Error('Only the owner administrator may edit vehicle registration details');error.statusCode=403;throw error}
  if(!String(payload.reason||'').trim()){const error=new Error('Reason is required for vehicle registration changes');error.statusCode=400;throw error}
  return fields
}
