import {useI18n} from './i18n.jsx'
import {formatDateDisplay} from './dateDisplay.js'

const words={zh:{next:'下次收货',none:'未安排'},ms:{next:'Kutipan seterusnya',none:'Belum dijadualkan'},en:{next:'Next collection',none:'Not scheduled'}}
export default function NextCollectionDate({value}){
 const {language}=useI18n(),w=words[language]||words.en
 return <p className="next-collection-date" data-i18n-raw style={{margin:'6px 0 10px',fontSize:'16px',fontWeight:600,color:'#176e60'}}>{w.next}：{value?formatDateDisplay(value):w.none}</p>
}
