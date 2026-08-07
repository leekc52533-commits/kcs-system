import {useCallback,useEffect,useState} from 'react'
import PasswordInput from './PasswordInput.jsx'
import FieldError from './FieldError.jsx'
import {useI18n} from './i18n.jsx'
import {clearFieldError,fieldAccessibility,passwordMessage,requiredMessage} from './formValidation.js'
import {apiRequest as api} from './apiClient.js'

const roles=['operations_admin','supervisor','office','driver','crew']
const temporaryPassword='12345678'
const emptyCreateForm=()=>({employeeId:'',username:'',role:'office',password:temporaryPassword})

export default function AccountManagementPage({account}){
  const{t,language}=useI18n()
  const[items,setItems]=useState([]),[employees,setEmployees]=useState([]),[selected,setSelected]=useState(null),[draft,setDraft]=useState(null)
  const[password,setPassword]=useState(''),[resetError,setResetError]=useState(''),[createForm,setCreateForm]=useState(emptyCreateForm),[createErrors,setCreateErrors]=useState({})
  const[message,setMessage]=useState(''),[error,setError]=useState('')
  const owner=account.role==='owner_admin'
  const load=useCallback((selectedId=null)=>Promise.all([api('/api/auth/accounts'),api('/api/resources')]).then(([data,resources])=>{setItems(data.items);setEmployees(resources.employees.filter(employee=>!employee.accountId&&employee.employmentStatus==='active'));if(selectedId){const fresh=data.items.find(item=>item.id===selectedId);setSelected(fresh||null);setDraft(fresh?{username:fresh.username,role:fresh.role}:null)}}).catch(item=>setError(item.message)),[])
  useEffect(()=>{void load()},[load])
  useEffect(()=>{setCreateErrors({});setResetError('')},[language])
  const resetCreate=()=>{setCreateForm(emptyCreateForm());setCreateErrors({})}
  const open=item=>{resetCreate();setSelected(item);setDraft({username:item.username,role:item.role});setPassword('');setResetError('');setMessage('');setError('')}
  const update=async payload=>{setError('');setMessage('');try{const result=await api(`/api/auth/accounts/${selected.id}`,{method:'PATCH',body:JSON.stringify(payload)});setSelected(result);setDraft({username:result.username,role:result.role});setPassword('');setResetError('');setMessage(t('account.updated'));await load(result.id)}catch(item){setError(item.message)}}
  const changeCreate=(field,value)=>{setCreateForm(current=>({...current,[field]:value}));clearFieldError(setCreateErrors,field)}
  const selectEmployee=value=>{const employee=employees.find(item=>String(item.id)===String(value));setSelected(null);setDraft(null);setCreateForm({...emptyCreateForm(),employeeId:value,username:employee?.employeeCode||''});setCreateErrors({});setError('');setMessage('')}
  const create=async event=>{event.preventDefault();setError('');const next={employeeId:requiredMessage(createForm.employeeId,t),username:requiredMessage(createForm.username,t),password:passwordMessage(createForm.password,t)};Object.keys(next).forEach(key=>{if(!next[key])delete next[key]});setCreateErrors(next);if(Object.keys(next).length)return;try{await api('/api/auth/accounts',{method:'POST',body:JSON.stringify({...createForm,username:createForm.username.trim()})});setMessage(t('account.created'));resetCreate();await load()}catch(item){setError(item.message)}}
  const reset=event=>{event.preventDefault();const validation=passwordMessage(password,t);setResetError(validation);if(!validation)void update({password})}
  return <div className="page account-management">
    <div className="data-title"><em>KCS SECURITY</em><h1>{t('account.title')}</h1><p>{t('account.description')}</p></div>
    {error&&<div className="data-error" role="alert">{error}</div>}{message&&<div className="import-message">{message}</div>}
    <form className="account-create" onSubmit={create} noValidate autoComplete="off">
      <h2>{t('account.create')}</h2>
      <label>{t('auth.employeeName')}<select name="new-account-employee" autoComplete="off" value={createForm.employeeId} onChange={event=>selectEmployee(event.target.value)} {...fieldAccessibility('create-account-employee-error',createErrors.employeeId)}><option value="">{t('account.selectEmployee')}</option>{employees.map(employee=><option key={employee.id} value={employee.id}>{employee.employeeCode} — {employee.name}</option>)}</select><FieldError id="create-account-employee-error" message={createErrors.employeeId}/></label>
      <label>{t('auth.username')}<input name="new-account-username" autoComplete="off" value={createForm.username} onChange={event=>changeCreate('username',event.target.value)} {...fieldAccessibility('create-account-username-error',createErrors.username)}/><FieldError id="create-account-username-error" message={createErrors.username}/></label>
      <label>{t('auth.systemRole')}<select value={createForm.role} onChange={event=>changeCreate('role',event.target.value)}>{roles.filter(role=>owner||role!=='operations_admin').map(role=><option key={role}>{role}</option>)}</select></label>
      <label>{t('account.temporaryPassword')}<PasswordInput name="new-account-temporary-password" autoComplete="new-password" value={createForm.password} onChange={event=>changeCreate('password',event.target.value)} {...fieldAccessibility('create-account-password-error',createErrors.password)}/><FieldError id="create-account-password-error" message={createErrors.password}/></label>
      <button>{t('account.createAction')}</button>
      <button type="button" className="secondary" onClick={resetCreate}>{t('common.cancel')}</button>
    </form>
    <div className="account-layout"><section className="account-list">{items.map(item=><button key={item.id} className={selected?.id===item.id?'selected':''} onClick={()=>open(item)}><b>{item.employeeName}</b><span>{item.username} · {item.role}</span><small>{t(item.isActive?'common.active':'common.disabled')}</small></button>)}</section>
      <section className="account-editor">{!selected?<p>{t('account.selectAccount')}</p>:<><h2>{selected.employeeName}</h2><p>{selected.employeeCode} · Account ID {selected.id}</p><label>{t('auth.username')}<input value={draft.username} disabled={!owner||selected.role==='owner_admin'} onChange={event=>setDraft({...draft,username:event.target.value})}/></label><label>{t('auth.systemRole')}<select value={draft.role} disabled={!owner||selected.role==='owner_admin'} onChange={event=>setDraft({...draft,role:event.target.value})}>{selected.role==='owner_admin'&&<option value="owner_admin">owner_admin</option>}{roles.map(role=><option key={role}>{role}</option>)}</select></label>{owner&&selected.role!=='owner_admin'&&<button onClick={()=>update(draft)}>{t('common.save')}</button>}<div className="account-actions"><button onClick={()=>update({isActive:!selected.isActive})} disabled={selected.role==='owner_admin'}>{t(selected.isActive?'common.disabled':'common.enabled')}</button><button onClick={()=>update({unlock:true})} disabled={selected.role==='owner_admin'}>{t('account.unlock')}</button></div><form onSubmit={reset} noValidate><label>{t('account.temporaryPassword')}<PasswordInput value={password} onChange={event=>{setPassword(event.target.value);setResetError('')}} {...fieldAccessibility('reset-account-password-error',resetError)}/><FieldError id="reset-account-password-error" message={resetError}/></label><button disabled={selected.role==='owner_admin'&&!owner}>{t('account.resetPassword')}</button></form></>}</section>
    </div>
  </div>
}
