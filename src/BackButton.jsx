import {useI18n} from './i18n.jsx'
import {backOrFallback} from './navigation.js'

export default function BackButton({fallback,className='global-back',label,onClick,iconOnly=true}){
  const{t}=useI18n()
  const accessibleLabel=label||t('common.back')
  return <button type="button" className={`${className} kcs-back-button${iconOnly?' record-icon-button':''}`} aria-label={iconOnly?accessibleLabel:undefined} title={iconOnly?accessibleLabel:undefined} onClick={onClick||(()=>backOrFallback(fallback,t('common.unsaved')))}><span className="kcs-back-arrow" aria-hidden="true">←</span>{!iconOnly&&` ${accessibleLabel}`}</button>
}
