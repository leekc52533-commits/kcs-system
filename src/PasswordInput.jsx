import {useState} from 'react'
import {useI18n} from './i18n.jsx'

export default function PasswordInput({value,onChange,...props}){
  const[visible,setVisible]=useState(false)
  const{t}=useI18n()
  return <span className="password-input">
    <input {...props} type={visible?'text':'password'} value={value} onChange={onChange}/>
    <button type="button" aria-label={t(visible?'auth.hidePassword':'auth.showPassword')} title={t(visible?'auth.hidePassword':'auth.showPassword')} onClick={()=>setVisible(value=>!value)}>{visible?'◉':'◌'}</button>
  </span>
}
