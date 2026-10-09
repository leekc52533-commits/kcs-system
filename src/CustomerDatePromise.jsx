import {useI18n} from './i18n.jsx'
import {formatDateDisplay} from './dateDisplay.js'
import {customerDateWords} from '../shared/customerDatePromise.js'
export default function CustomerDatePromise({value}){
 const {language}=useI18n(),w=customerDateWords[language]||customerDateWords.en
 return value?<p data-i18n-raw role="note" style={{color:'#a12622',fontWeight:700,margin:'6px 0'}}>{w.badge}: {formatDateDisplay(value.date)} · {w.locked}</p>:null
}
