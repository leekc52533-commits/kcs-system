import {db as defaultDb} from './database.mjs'
const fail=code=>Object.assign(new Error(code),{code,statusCode:403})
export function assertPreviewManager(actor,db=defaultDb){
 if(!['owner_admin','operations_admin','supervisor'].includes(actor?.role)||actor.mustChangePassword||!db.prepare("SELECT 1 FROM employees WHERE id=? AND is_active=1 AND employment_status='active'").get(Number(actor.employeeId)))throw fail('PREVIEW_ACCESS')
}
const targetsSql=`SELECT a.id,a.employee_id employeeId,e.employee_code employeeCode,e.name employeeName,a.username,COALESCE(NULLIF(a.system_role,''),a.role) role,a.preferred_language preferredLanguage,a.must_change_password mustChangePassword
 FROM auth_accounts a JOIN employees e ON e.id=a.employee_id WHERE a.is_active=1 AND e.is_active=1 AND e.employment_status='active' AND COALESCE(NULLIF(a.system_role,''),a.role) IN ('driver','crew')`
export function previewEmployees(actor,db=defaultDb){assertPreviewManager(actor,db);return db.prepare(targetsSql+' ORDER BY e.name,e.id').all()}
export function previewAccount(id,actor,db=defaultDb){
 assertPreviewManager(actor,db)
 const account=db.prepare(targetsSql+' AND e.id=?').get(Number(id));if(!account)throw fail('PREVIEW_EMPLOYEE')
 return {...account,isActive:true,mustChangePassword:Boolean(account.mustChangePassword),permissions:db.prepare('SELECT permission FROM auth_account_permissions WHERE account_id=?').all(account.id).map(r=>r.permission)}
}
const paths=new Set(['/api/mobile/cargo-batches','/api/mobile/cargo-batches/lookup','/api/mobile/my-bills','/api/mobile/today','/api/mobile/tomorrow','/api/mobile/unloading-weights/context','/api/mobile/cash-float','/api/mobile/customer-intakes','/api/mobile/customer-pickup-search','/api/mobile/customer-pickup-details','/api/mobile/guide','/api/mobile/notices','/api/gps-collection/branches','/api/bill-voids'])
export function previewReadUrl(method,path){
 if(method!=='GET'||typeof path!=='string'||!path.startsWith('/api/')||path.includes('\\'))throw fail('PREVIEW_READ_ONLY')
 const url=new URL(path,'http://kcs.local')
 if(!paths.has(url.pathname)&&!/^\/api\/mobile\/my-bills\/\d+\/proof$/.test(url.pathname)&&!/^\/api\/mobile\/stops\/\d+\/billing$/.test(url.pathname)&&!/^\/api\/(no-goods-notices|driver-no-goods|purchase-payment-proofs|driver-arrangements)\/\d+\/photo$/.test(url.pathname)&&!/^\/api\/bill-voids\/\d+\/replacement$/.test(url.pathname))throw fail('PREVIEW_READ_ONLY')
 return url
}
