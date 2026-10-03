// Explicit public business messages only. Never expose arbitrary exceptions or SQL.
const rules=[
 ['ASSIGNMENT_CONFLICT',409,/^该(?:司机|跟车员)当天已分配给 (.{1,100})，请先解除原分配$/,m=>({zh:`该员工当天已分配给 ${m[1]}。请先在原车辆解除分配，再安排到这辆车。`,en:`This employee is already assigned to ${m[1]} on this date. Remove the original assignment before assigning this vehicle.`,ms:`Pekerja ini sudah ditugaskan kepada ${m[1]} pada tarikh ini. Batalkan penugasan asal sebelum menugaskannya kepada kenderaan ini.`})],
 ['ASSIGNMENT_ROLE_CONFLICT',409,/^(?:同一员工同一天不能同时担任 Driver 与 Attendant|该员工当天已担任 (?:Driver|Attendant)，不能同时担任 (?:Driver|Attendant))$/,()=>({zh:'该员工当天已有司机或跟车员安排，不能同时担任两种角色。请先解除原安排。',en:'This employee already has a driver or attendant assignment for this date. Remove it before changing roles.',ms:'Pekerja ini sudah ditugaskan sebagai pemandu atau kelindan pada tarikh ini. Batalkan penugasan asal sebelum menukar peranan.'})],
 ['EMPLOYEE_UNAVAILABLE',409,/^所选员工不是可用 (Driver|Assistant\/Crew)$/,m=>({zh:`所选员工目前不能担任${m[1]==='Driver'?'司机':'跟车员'}。请检查员工是否启用及其工作职位。`,en:`The selected employee is not available as ${m[1]}. Check employment status and job roles.`,ms:`Pekerja yang dipilih tidak tersedia sebagai ${m[1]}. Semak status pekerja dan jawatannya.`})],
 ['CREW_LIMIT',400,/^每辆车最多只能安排 (\d+) 名 Assistant\/Crew$/,m=>({zh:`每辆车最多安排 ${m[1]} 名跟车员，请减少选择人数。`,en:`Select no more than ${m[1]} attendants per vehicle.`,ms:`Pilih tidak lebih daripada ${m[1]} kelindan bagi setiap kenderaan.`})],
 ['CURRENT_PASSWORD_INCORRECT',400,/^当前密码不正确$/,()=>({zh:'当前密码不正确，请重新输入。若管理员刚重设密码，请使用最新的临时密码。',en:'The current password is incorrect. Enter it again; if an administrator reset it, use the latest temporary password.',ms:'Kata laluan semasa tidak betul. Masukkan semula; jika pentadbir telah menetapkannya semula, gunakan kata laluan sementara terkini.'})],
 ['ROUTE_REAPPROVAL_REQUIRED',409,/^路线必须先按当前版本重新批准$/,()=>({zh:'路线安排已修改，请主管先重新批准当前版本，再继续操作。',en:'The route has changed. Ask a supervisor to approve the current version before continuing.',ms:'Laluan telah berubah. Minta penyelia meluluskan versi terkini sebelum meneruskan.'})],
 ['STOP_ORDER_LOCKED',409,/^此客户顺序已锁定，请先解除锁定$/,()=>({zh:'此客户的顺序已锁定，请先解除锁定，再调整顺序。',en:'This customer order is locked. Unlock it before changing the order.',ms:'Turutan pelanggan ini dikunci. Buka kunci sebelum mengubah turutan.'})],
 ['ROUTE_WITHDRAWAL_BLOCKED',409,/^This route has been released or started and cannot be withdrawn\.$/,()=>({zh:'这条路线已经发布或开始执行，不能撤回批准。请使用当天调配功能处理人员变更。',en:'This route has been released or started and cannot be withdrawn. Use the daily handover function for staff changes.',ms:'Laluan ini telah dikeluarkan atau bermula dan kelulusannya tidak boleh ditarik balik. Gunakan fungsi pertukaran harian untuk perubahan pekerja.'})],
 ['VEHICLE_UNAVAILABLE',409,/^Vehicle is not available for this date$/,()=>({zh:'这辆车在所选日期不可用，请检查车辆状态或选择其他车辆。',en:'This vehicle is unavailable on the selected date. Check its status or choose another vehicle.',ms:'Kenderaan ini tidak tersedia pada tarikh dipilih. Semak statusnya atau pilih kenderaan lain.'})]
]
export function businessError(error){
 const message=String(error?.message||error||'')
 for(const [errorCode,status,pattern,render] of rules){const match=message.match(pattern);if(match)return{errorCode,status,messages:render(match)}}
 return null
}
