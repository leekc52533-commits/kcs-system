import {useI18n} from './i18n.jsx'
import {backOrFallback} from './navigation.js'

export default function BackButton({fallback,className='global-back'}){
  const{t}=useI18n()
  return <button type="button" className={className} onClick={()=>backOrFallback(fallback,t('common.unsaved'))}>← {t('common.back')}</button>
}
