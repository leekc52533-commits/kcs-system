import {db as defaultDb} from './database.mjs'
import {createEmployee,getEmployeeMaster} from './resourceService.mjs'
import {createAccount} from './authService.mjs'

// One employee and optional login are committed together, including existing audits.
export function createEmployeeWithAccount(payload,actor,meta={},database=defaultDb){
 database.exec('SAVEPOINT employee_and_account')
 try{
  const employee=createEmployee(payload,database)
  if(payload.loginAccount)createAccount({...payload.loginAccount,employeeId:employee.id,username:String(payload.loginAccount.username||'').trim()||employee.employeeCode},actor,meta,database)
  const result=getEmployeeMaster(employee.id,database)
  database.exec('RELEASE employee_and_account')
  return result
 }catch(error){database.exec('ROLLBACK TO employee_and_account; RELEASE employee_and_account');throw error}
}
