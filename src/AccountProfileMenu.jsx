import {useState} from 'react'
import {useI18n} from './i18n.jsx'
import {languageOptions} from './translations.js'

export default function AccountProfileMenu({account,onChangePassword,onAccountManagement,onLogout}){
  const{t,language,setLanguage}=useI18n()
  const[open,setOpen]=useState(false)
  const canManage=Boolean(onAccountManagement&&['owner_admin','operations_admin'].includes(account.role))
  const action=callback=>{setOpen(false);callback()}
  return <div className="account-profile">
    <button className="user-menu" aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{account.employeeName}<span>⌄</span></button>
    {open&&<div className="account-profile-menu" role="menu">
      <div className="account-profile-heading"><strong>{account.employeeName}</strong><span>{account.username}</span></div>
      <dl>
        <div><dt>{t('auth.employeeName')}</dt><dd>{account.employeeName}</dd></div>
        <div><dt>{t('auth.username')}</dt><dd>{account.username}</dd></div>
        <div><dt>{t('auth.employeeCode')}</dt><dd>{account.employeeCode||'—'}</dd></div>
        <div><dt>{t('auth.systemRole')}</dt><dd><b>{account.role}</b></dd></div>
        <div className="profile-language"><dt>{t('auth.preferredLanguage')}</dt><dd><select aria-label={t('auth.preferredLanguage')} value={language} onChange={event=>void setLanguage(event.target.value)}>{languageOptions.map(option=><option key={option.code} value={option.code}>{option.label}</option>)}</select></dd></div>
      </dl>
      <button role="menuitem" onClick={()=>action(onChangePassword)}>{t('auth.changePassword')}</button>
      {canManage&&<button role="menuitem" onClick={()=>action(onAccountManagement)}>{t('nav.accounts')}</button>}
      <button role="menuitem" className="danger" onClick={()=>action(onLogout)}>{t('common.logout')}</button>
    </div>}
  </div>
}
