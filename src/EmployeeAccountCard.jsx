import {useState} from 'react'
import PasswordInput from './PasswordInput.jsx'
import {useI18n} from './i18n.jsx'
import {apiRequest as api} from './apiClient.js'
import {passwordMessage} from './formValidation.js'

const roles=['operations_admin','supervisor','office','driver','crew']
const roleOf=actor=>actor?.systemRole||actor?.role
const canManage=actor=>['owner_admin','operations_admin'].includes(roleOf(actor))
export function NewEmployeeAccountFields({actor,value,onChange}){
 const{t}=useI18n()
 if(!canManage(actor))return <p>{t('staff.accountRestricted')}</p>
 return <div className="employee-detail-grid"><label className="wide"><input type="checkbox" checked={Boolean(value)} onChange={event=>onChange(event.target.checked?{username:'',role:'driver',password:''}:null)}/>{t('staff.createLogin')}</label>{value&&<><label>{t('auth.username')}<input autoComplete="off" value={value.username} placeholder={t('staff.codeDefault')} onChange={event=>onChange({...value,username:event.target.value})}/></label><label>{t('auth.systemRole')}<select value={value.role} onChange={event=>onChange({...value,role:event.target.value})}>{roles.filter(role=>roleOf(actor)==='owner_admin'||role!=='operations_admin').map(role=><option key={role} value={role}>{t('staff.role.'+role)}</option>)}</select></label><label>{t('account.temporaryPassword')}<PasswordInput autoComplete="new-password" value={value.password} onChange={event=>onChange({...value,password:event.target.value})}/></label></>}</div>
}
export default function EmployeeAccountCard({employee,actor,refresh,blocked=false}){
 const{t}=useI18n(),owner=roleOf(actor)==='owner_admin',targetOwner=employee.systemRole==='owner_admin',eligible=employee.employmentStatus==='active'
 const [draft,setDraft]=useState({username:employee.username||employee.employeeCode,role:employee.systemRole||'driver'}),[newAccount,setNewAccount]=useState(null),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 const allowed=canManage(actor)&&(owner||!['owner_admin','operations_admin'].includes(employee.systemRole))
 const update=async(payload,create=false)=>{
  setError('');setMessage('');if((create||payload.password)&&passwordMessage(payload.password,t)){setError(passwordMessage(payload.password,t));return}
  setBusy(true)
  try{await api(create?'/api/auth/accounts':`/api/auth/accounts/${employee.accountId}`,{method:create?'POST':'PATCH',body:JSON.stringify(payload)});setPassword('');setNewAccount(null);await refresh();setMessage(t('account.updated'))}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <div className="employee-account-card">{blocked&&<p>{t('staff.saveFirst')}</p>}<fieldset disabled={busy||blocked}>{error&&<div role="alert" className="data-error">{error}</div>}{message&&<div role="status">{message}</div>}{employee.accountId?<>
 <p>{t('list.accountStatus')}: <b>{t(employee.accountActive?'common.active':'common.disabled')}</b></p>
 <div className="employee-detail-grid"><label>{t('auth.username')}<input value={draft.username} disabled={!allowed||!owner||targetOwner||busy} onChange={e=>setDraft({...draft,username:e.target.value})}/></label><label>{t('auth.systemRole')}<select value={draft.role} disabled={!allowed||!owner||targetOwner||busy} onChange={e=>setDraft({...draft,role:e.target.value})}>{targetOwner&&<option value="owner_admin">{t('staff.role.owner_admin')}</option>}{roles.map(role=><option value={role} key={role}>{t('staff.role.'+role)}</option>)}</select></label></div>
 {allowed&&<><div className="account-actions">{owner&&!targetOwner&&<button disabled={busy} onClick={()=>update(draft)}>{t('common.save')}</button>}<button disabled={busy||targetOwner||(!employee.accountActive&&!eligible)} onClick={()=>update({isActive:!employee.accountActive})}>{t(employee.accountActive?'staff.disableLogin':'staff.enableLogin')}</button><button disabled={busy||targetOwner} onClick={()=>update({unlock:true})}>{t('account.unlock')}</button></div>
 <form onSubmit={event=>{event.preventDefault();if(passwordMessage(password,t)){setError(passwordMessage(password,t));return}void update({password})}}><label>{t('account.temporaryPassword')}<PasswordInput autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>{t('account.resetPassword')}</button></form>
 {owner&&<div className="account-permissions">{['employee_identity_sensitive','employee_payroll_sensitive','employee_sensitive_import'].map(permission=><label key={permission}><input type="checkbox" disabled={busy} checked={(employee.accountPermissions||[]).includes(permission)} onChange={()=>update({permissions:(employee.accountPermissions||[]).includes(permission)?employee.accountPermissions.filter(x=>x!==permission):[...(employee.accountPermissions||[]),permission]})}/>{t('staff.permission.'+permission)}</label>)}</div>}</>
 }</>:eligible?<><NewEmployeeAccountFields actor={actor} value={newAccount} onChange={setNewAccount}/>{newAccount&&<button disabled={busy} onClick={()=>update({...newAccount,employeeId:employee.id,username:newAccount.username.trim()||employee.employeeCode},true)}>{t('account.createAction')}</button>}</>:<p>{t('staff.departureHelp')}</p>}{employee.accountId&&!eligible&&<p>{t('staff.ineligible')}</p>}{!allowed&&employee.accountId&&<p>{t('staff.accountRestricted')}</p>}</fieldset></div>
}
