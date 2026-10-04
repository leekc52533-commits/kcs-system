import {forwardRef,useEffect,useRef,useState} from 'react'
import {useI18n} from './i18n.jsx'
import {dateInputDisplay,parseDateInput} from './dateDisplay.js'
import './DateInput.css'
const DateInput=forwardRef(function DateInput(props,ref){
 return ['date','datetime-local'].includes(props.type)?<DateField {...props} forwardedRef={ref}/>:<input {...props} ref={ref}/>
})
export default DateInput
function DateField({forwardedRef,type='date',value,defaultValue,onChange,onBlur,min,max,step,className='',style,...rest}){
 const{language}=useI18n(),text=useRef(null),picker=useRef(null),last=useRef(value??defaultValue??''),[draft,setDraft]=useState(()=>dateInputDisplay(last.current))
 const words=({zh:{placeholder:'DD-MMM-YY',invalid:'请按DD-MMM-YY填写有效日期',range:'日期不在允许范围内',calendar:'选择日期'},ms:{placeholder:'DD-MMM-YY',invalid:'Sila isi tarikh sah dalam format DD-MMM-YY',range:'Tarikh di luar julat yang dibenarkan',calendar:'Pilih tarikh'},en:{placeholder:'DD-MMM-YY',invalid:'Enter a valid date as DD-MMM-YY',range:'Date is outside the allowed range',calendar:'Choose date'}})[language]||{placeholder:'DD-MMM-YY',invalid:'Enter a valid date as DD-MMM-YY',range:'Date is outside the allowed range',calendar:'Choose date'}
 useEffect(()=>{if(value!==undefined&&value!==last.current){last.current=value;setDraft(dateInputDisplay(value))}},[value])
 const iso=draft?parseDateInput(draft,type,last.current):'',invalid=draft&&!iso,range=iso&&((min&&iso<min)||(max&&iso>max))
 useEffect(()=>{text.current?.setCustomValidity(invalid?words.invalid:range?words.range:'')},[invalid,range,words.invalid,words.range])
 const emit=(next,event)=>{last.current=next;const target={...event.target,value:next,name:rest.name,id:rest.id};onChange?.({...event,target,currentTarget:target})}
 return <span className="kcs-date-field" style={style}><input {...rest} ref={node=>{text.current=node;if(typeof forwardedRef==='function')forwardedRef(node);else if(forwardedRef)forwardedRef.current=node}} type="text" className={className+' kcs-date-text'} value={draft} placeholder={words.placeholder+(type==='datetime-local'?' HH:mm':'')} aria-invalid={invalid||range?true:undefined} autoComplete="off" onChange={e=>{const next=e.target.value;setDraft(next);const parsed=next?parseDateInput(next,type,last.current):'';if(parsed!==null)emit(parsed,e)}} onBlur={e=>onBlur?.({...e,target:{...e.target,value:iso||'',name:rest.name},currentTarget:{...e.currentTarget,value:iso||'',name:rest.name}})}/>{!rest.readOnly&&<span className="kcs-date-picker"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v4m12-4v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"/></svg><input ref={picker} type={type} value={iso||''} min={min} max={max} step={step} disabled={rest.disabled} tabIndex={0} aria-label={words.calendar} onClick={e=>{try{e.currentTarget.showPicker?.()}catch{}}} onChange={e=>{setDraft(dateInputDisplay(e.target.value));emit(e.target.value,e)}}/></span>}</span>
}
