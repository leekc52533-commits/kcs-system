/* eslint-disable react/only-export-components -- provider, selector and hook are one i18n surface */
import {createContext,useCallback,useContext,useEffect,useMemo} from 'react'
import {languageOptions,translate,translateSource} from './translations.js'
import {setApiLanguage} from './apiClient.js'

const I18nContext=createContext({language:'en',setLanguage:()=>{},t:key=>translate('en',key)})

export function I18nProvider({language,setLanguage,children}){
  useEffect(()=>setApiLanguage(language),[language])
  useEffect(()=>{
    const localize=root=>{
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT)
      let node
      while((node=walker.nextNode())){
        if(node.parentElement?.closest('[data-i18n-raw]'))continue
        const next=translateSource(language,node.nodeValue)
        if(next!==node.nodeValue)node.nodeValue=next
      }
      for(const element of root.querySelectorAll?.('[placeholder],[aria-label],[title]')||[]){
        if(element.closest('[data-i18n-raw]'))continue
        for(const name of ['placeholder','aria-label','title']){
          if(element.hasAttribute(name))element.setAttribute(name,translateSource(language,element.getAttribute(name)))
        }
      }
    }
    localize(document.body)
    const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===Node.ELEMENT_NODE)localize(node);else if(node.nodeType===Node.TEXT_NODE&&node.parentElement)localize(node.parentElement)})
    observer.observe(document.body,{childList:true,subtree:true})
    return()=>observer.disconnect()
  },[language])
  const t=useCallback((key,variables)=>translate(language,key,variables),[language])
  const value=useMemo(()=>({language,setLanguage,t}),[language,setLanguage,t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export const useI18n=()=>useContext(I18nContext)

export function LanguageSelector({compact=false}){
  const{language,setLanguage}=useI18n()
  return <label className={compact?'language-selector compact':'language-selector'}>
    <span className="sr-only">{translate(language,'common.language')}</span>
    <select aria-label={translate(language,'common.language')} value={language} onChange={event=>setLanguage(event.target.value)}>
      {languageOptions.map(option=><option key={option.code} value={option.code}>{option.label}</option>)}
    </select>
  </label>
}
