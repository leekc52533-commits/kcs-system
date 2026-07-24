/* eslint-disable react/only-export-components -- provider, selector and hook are one i18n surface */
import {createContext,useCallback,useContext,useMemo} from 'react'
import {languageOptions,translate} from './translations.js'

const I18nContext=createContext({language:'en',setLanguage:()=>{},t:key=>translate('en',key)})

export function I18nProvider({language,setLanguage,children}){
  const t=useCallback((key,variables)=>translate(language,key,variables),[language])
  const value=useMemo(()=>({language,setLanguage,t}),[language,setLanguage,t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export const useI18n=()=>useContext(I18nContext)

export function LanguageSelector({compact=false}){
  const{language,setLanguage}=useI18n()
  return <label className={compact?'language-selector compact':'language-selector'}>
    <span className="sr-only">Language</span>
    <select aria-label="Language" value={language} onChange={event=>setLanguage(event.target.value)}>
      {languageOptions.map(option=><option key={option.code} value={option.code}>{option.label}</option>)}
    </select>
  </label>
}
