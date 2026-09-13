import {db as defaultDb} from './database.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'
export const GUIDE_VERSION='driver-guide-2026-09-14-v1'
export const GUIDE_START='2026-09-14'
function employee(ctx,db){const e=db.prepare("SELECT id FROM employees WHERE id=? AND is_active=1 AND employment_status='active'").get(Number(ctx.employeeId));if(!e)throw Object.assign(Error('NOTICE_ACCESS'),{code:'NOTICE_ACCESS',statusCode:403});return e.id}
export function driverGuideStatus(ctx,db=defaultDb){
 const id=employee(ctx,db),active=kuchingDate(ctx.now||new Date())>=GUIDE_START
 return{version:GUIDE_VERSION,effectiveAt:'2026-09-14T00:00:00+08:00',active,readAt:db.prepare('SELECT read_at FROM employee_guide_reads WHERE employee_id=? AND guide_version=?').get(id,GUIDE_VERSION)?.read_at||null}
}
export function acknowledgeDriverGuide(payload,ctx,db=defaultDb){
 const status=driverGuideStatus(ctx,db)
 if(!status.active||payload.version!==GUIDE_VERSION)throw Object.assign(Error('GUIDE_STALE'),{code:'GUIDE_STALE',statusCode:409})
 db.prepare('INSERT OR IGNORE INTO employee_guide_reads(employee_id,guide_version,read_at) VALUES(?,?,?)').run(Number(ctx.employeeId),GUIDE_VERSION,new Date(ctx.now||Date.now()).toISOString())
 return driverGuideStatus(ctx,db)
}
