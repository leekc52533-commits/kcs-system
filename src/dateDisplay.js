import {formatDateDisplay,months} from '../shared/datePresentation.js'
export {formatDateDisplay}
export function dateInputDisplay(value){return formatDateDisplay(String(value||''))}
export function parseDateInput(value,type='date',reference=''){
 let match=/^(\d{2})-([a-z]{3})-(\d{2}|\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/i.exec(value)
 if(match){const month=months.findIndex(m=>m.toLowerCase()===match[2].toLowerCase())+1;if(!month)return null;match[2]=String(month).padStart(2,'0');if(match[3].length===2){const century=/^\d{4}/.test(reference)&&reference.slice(2,4)===match[3]?reference.slice(0,2):'20';match[3]=century+match[3]}}
 else match=/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value)
 if(!match||type==='date'&&match[4]||type==='datetime-local'&&!match[4])return null
 const [,d,m,y,h,minute,second]=match,iso=`${y}-${m}-${d}`,date=new Date(iso+'T00:00:00Z')
 if(Number.isNaN(+date)||date.toISOString().slice(0,10)!==iso||Number(h)>23||Number(minute)>59||Number(second)>59)return null
 return iso+(h?`T${h}:${minute}${second?':'+second:''}`:'')
}
