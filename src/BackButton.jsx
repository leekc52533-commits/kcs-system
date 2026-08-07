import {useI18n} from './i18n.jsx'
import {backOrFallback} from './navigation.js'

export default function BackButton({fallback,className='global-back',label,onClick}){
  const{t}=useI18n()
  return <button type="button" className={className} onClick={onClick||(()=>backOrFallback(fallback,t('common.unsaved')))}>← {label||t('common.back')}</button>
}
