import {useI18n} from './i18n.jsx'
import {backOrFallback} from './navigation.js'

export default function BackButton({fallback,className='global-back',label,onClick,iconOnly=false}){
  const{t}=useI18n()
  const accessibleLabel=label||t('common.back')
  return <button type="button" className={className} aria-label={iconOnly?accessibleLabel:undefined} title={iconOnly?accessibleLabel:undefined} onClick={onClick||(()=>backOrFallback(fallback,t('common.unsaved')))}>←{!iconOnly&&` ${accessibleLabel}`}</button>
}
