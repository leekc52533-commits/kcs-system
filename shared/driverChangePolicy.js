export const DRIVER_APPROVAL_START='2026-09-14'
export const requiresDriverApproval=date=>typeof date==='string'&&date>=DRIVER_APPROVAL_START
export function hasVerifiedArrival(stop){
 return Boolean(stop?.arrived_at&&stop.arrival_captured_at&&stop.arrived_by_employee_id&&stop.arrival_accuracy_m!=null&&Number(stop.arrival_accuracy_m)>0&&Number(stop.arrival_accuracy_m)<=50&&stop.arrival_distance_m!=null&&Number(stop.arrival_distance_m)<=150)
}
