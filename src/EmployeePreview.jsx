import {useEffect,useState} from 'react'
import {MobileApp} from './AuthPages.jsx'
import {I18nProvider,useI18n} from './i18n.jsx'
import {apiErrorMessage,setPreviewEmployee,previewReadPath} from './apiClient.js'
import './EmployeePreview.css'

export function PreviewGuard({children}){
 const{t}=useI18n(),[blocked,setBlocked]=useState(false)
 const stop=e=>{e.preventDefault();e.stopPropagation();setBlocked(true)}
 const click=e=>{
  const el=e.target.closest('button,a,input[type=file]');if(!el)return
  if(el.matches('a')){const path=el.getAttribute('href');if(path?.startsWith('/api/')){if(!path.startsWith('/api/acting-collector/preview/'))el.href=previewReadPath(path);return}return stop(e)}
  if(el.closest('[data-preview-safe],.mobile-app > nav,.mobile-more,.route-day-switch')||el.matches('.stop-name-button,.user-menu'))return
  stop(e)
 }
 return <div onClickCapture={click} onAuxClickCapture={click} onSubmitCapture={stop}><div className="employee-preview-banner"><strong>{t('preview.title')}</strong><p>{t('preview.readOnly')}</p><small>{t('preview.limit')}</small>{blocked&&<p role="status">{t('preview.blocked')}</p>}</div>{children}</div>
}

function PasswordRequired(){const{t}=useI18n();return <p role="status">{t('preview.password')}</p>}

export default function EmployeePreview({employeeId}){
 const[account,setAccount]=useState(null),[error,setError]=useState(''),[language,setLanguage]=useState('en')
 useEffect(()=>{let alive=true;setPreviewEmployee(employeeId);fetch(`/api/acting-collector/preview/${employeeId}`).then(async r=>{const data=await r.json();if(!r.ok)throw Error(apiErrorMessage(data));if(alive){setAccount(data.account);setLanguage(data.account.preferredLanguage||'en')}}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false;setPreviewEmployee(null)}},[employeeId])
 return <I18nProvider language={language} setLanguage={setLanguage}><PreviewGuard>{error?<p role="alert">{error}</p>:account?account.mustChangePassword?<PasswordRequired/>:<MobileApp account={account} onLogout={()=>{}} onChangePassword={()=>{}}/>:<p>…</p>}</PreviewGuard></I18nProvider>
}
