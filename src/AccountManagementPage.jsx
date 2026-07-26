import {useCallback,useEffect,useState} from 'react'
import PasswordInput from './PasswordInput.jsx'
import FieldError from './FieldError.jsx'
import {useI18n} from './i18n.jsx'
import {clearFieldError,fieldAccessibility,passwordMessage,requiredMessage} from './formValidation.js'

const roles=['operations_admin','supervisor','office','driver','crew']
const api=async(path,options={})=>{const response=await fetch(path,{headers:{'Content-Type':'application/json'},...options}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Account request failed');return data}

export default function AccountManagementPage({account}){
  const{t,language}=useI18n()
  const[items,setItems]=useState([]),[employees,setEmployees]=useState([]),[selected,setSelected]=useState(null),[draft,setDraft]=useState(null)
  const[password,setPassword]=useState(''),[resetError,setResetError]=useState(''),[createForm,setCreateForm]=useState({employeeId:'',username:'',role:'office',password:''}),[createErrors,setCreateErrors]=useState({})
  const[message,setMessage]=useState(''),[error,setError]=useState('')
  const owner=account.role==='owner_admin'
  const load=useCallback((selectedId=null)=>Promise.all([api('/api/auth/accounts'),api('/api/resources')]).then(([data,resources])=>{setItems(data.items);setEmployees(resources.employees.filter(employee=>!employee.accountId&&employee.employmentStatus==='active'));if(selectedId){const fresh=data.items.find(item=>item.id===selectedId);setSelected(fresh||null);setDraft(fresh?{username:fresh.username,role:fresh.role}:null)}}).catch(item=>setError(item.message)),[])
  useEffect(()=>{void load()},[load])
  useEffect(()=>{setCreateErrors({});setResetError('')},[language])
  const open=item=>{setSelected(item);setDraft({username:item.username,role:item.role});setPassword('');setResetError('');setMessage('');setError('')}
  const update=async payload=>{setError('');setMessage('');try{const result=await api(`/api/auth/accounts/${selected.id}`,{method:'PATCH',body:JSON.stringify(payload)});setSelected(result);setDraft({username:result.username,role:result.role});setPassword('');setResetError('');setMessage('Account updated and audit recorded.');await load(result.id)}catch(item){setError(item.message)}}
  const changeCreate=(field,value)=>{setCreateForm(current=>({...current,[field]:value}));clearFieldError(setCreateErrors,field)}
  const create=async event=>{event.preventDefault();setError('');const next={employeeId:requiredMessage(createForm.employeeId,t),username:requiredMessage(createForm.username,t),password:passwordMessage(createForm.password,t)};Object.keys(next).forEach(key=>{if(!next[key])delete next[key]});setCreateErrors(next);if(Object.keys(next).length)return;try{await api('/api/auth/accounts',{method:'POST',body:JSON.stringify(createForm)});setMessage('Account created. The employee must change the temporary password at first login.');setCreateForm({employeeId:'',username:'',role:'office',password:''});setCreateErrors({});await load()}catch(item){setError(item.message)}}
  const reset=event=>{event.preventDefault();const validation=passwordMessage(password,t);setResetError(validation);if(!validation)void update({password})}
  return <div className="page account-management">
    <div className="data-title"><em>KCS SECURITY</em><h1>{t('nav.accounts')}</h1><p>System Role is separate from Primary Job Role. Owner Admin controls usernames and roles.</p></div>
    {error&&<div className="data-error" role="alert">{error}</div>}{message&&<div className="import-message">{message}</div>}
    <form className="account-create" onSubmit={create} noValidate>
      <h2>Create employee account</h2>
      <label>Employee<select value={createForm.employeeId} onChange={event=>changeCreate('employeeId',event.target.value)} {...fieldAccessibility('create-account-employee-error',createErrors.employeeId)}><option value="">Select active employee</option>{employees.map(employee=><option key={employee.id} value={employee.id}>{employee.employeeCode} — {employee.name}</option>)}</select><FieldError id="create-account-employee-error" message={createErrors.employeeId}/></label>
      <label>Username<input value={createForm.username} onChange={event=>changeCreate('username',event.target.value)} {...fieldAccessibility('create-account-username-error',createErrors.username)}/><FieldError id="create-account-username-error" message={createErrors.username}/></label>
      <label>System Role<select value={createForm.role} onChange={event=>changeCreate('role',event.target.value)}>{roles.filter(role=>owner||role!=='operations_admin').map(role=><option key={role}>{role}</option>)}</select></label>
      <label>Temporary password<PasswordInput value={createForm.password} onChange={event=>changeCreate('password',event.target.value)} {...fieldAccessibility('create-account-password-error',createErrors.password)}/><FieldError id="create-account-password-error" message={createErrors.password}/></label>
      <button>Create account</button>
    </form>
    <div className="account-layout"><section className="account-list">{items.map(item=><button key={item.id} className={selected?.id===item.id?'selected':''} onClick={()=>open(item)}><b>{item.employeeName}</b><span>{item.username} · {item.role}</span><small>{item.isActive?'Active':'Disabled'}</small></button>)}</section>
      <section className="account-editor">{!selected?<p>Select an account.</p>:<><h2>{selected.employeeName}</h2><p>{selected.employeeCode} · Account ID {selected.id}</p><label>Username<input value={draft.username} disabled={!owner||selected.role==='owner_admin'} onChange={event=>setDraft({...draft,username:event.target.value})}/></label><label>System Role<select value={draft.role} disabled={!owner||selected.role==='owner_admin'} onChange={event=>setDraft({...draft,role:event.target.value})}>{selected.role==='owner_admin'&&<option value="owner_admin">owner_admin</option>}{roles.map(role=><option key={role}>{role}</option>)}</select></label>{owner&&selected.role!=='owner_admin'&&<button onClick={()=>update(draft)}>{t('common.save')}</button>}<div className="account-actions"><button onClick={()=>update({isActive:!selected.isActive})} disabled={selected.role==='owner_admin'}>{selected.isActive?'Disable':'Enable'}</button><button onClick={()=>update({unlock:true})} disabled={selected.role==='owner_admin'}>Unlock</button></div><form onSubmit={reset} noValidate><label>Temporary password<PasswordInput value={password} onChange={event=>{setPassword(event.target.value);setResetError('')}} {...fieldAccessibility('reset-account-password-error',resetError)}/><FieldError id="reset-account-password-error" message={resetError}/></label><button disabled={selected.role==='owner_admin'&&!owner}>Reset password</button></form></>}</section>
    </div>
  </div>
}
