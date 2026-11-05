import {focusNextField} from './enterNext.js'
import {useId,useState} from 'react'
export default function BackfillCompanyPicker({customers,value,onChange,label,empty,disabled}){
 const id=useId(),[open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0)
 const selected=customers.find(c=>String(c.id)===value)
 const choices=customers.filter(c=>`${c.name} ${c.code||''}`.toLowerCase().includes(query.trim().toLowerCase()))
 const pick=c=>{onChange(String(c.id));setQuery('');setOpen(false);setActive(0)}
 const show=()=>{if(!disabled){setOpen(true);setQuery('');setActive(0)}}
 return <div className="backfill-company" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget)){setOpen(false);setQuery('')}}}>
 <label htmlFor={id}>{label}</label><input id={id} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={open} aria-controls={id+'-list'} aria-activedescendant={open&&choices[active]?id+'-'+choices[active].id:undefined} disabled={disabled} value={open?query:selected?`${selected.name} · ${selected.code||selected.id}`:''} onFocus={show} onClick={()=>{if(!open)show()}} onChange={e=>{setQuery(e.target.value);onChange('');setOpen(true);setActive(0)}} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!open){show();return}setActive(n=>Math.max(0,Math.min(choices.length-1,n+(e.key==='ArrowDown'?1:-1))))}if(e.key==='Enter'){e.preventDefault();if(e.nativeEvent.isComposing||e.repeat)return;if(open&&choices[active]){const input=e.currentTarget;pick(choices[active]);setTimeout(()=>focusNextField(input),0)}else show()}if(e.key==='Escape'){e.preventDefault();setOpen(false);setQuery('')}}}/>
 {open&&<div className="backfill-company-list" id={id+'-list'} role="listbox" aria-label={label}>{choices.map((c,i)=><button type="button" role="option" aria-selected={i===active} id={id+'-'+c.id} key={c.id} tabIndex={-1} onMouseDown={e=>e.preventDefault()} onClick={()=>pick(c)} data-i18n-raw>{c.name} · {c.code||c.id}</button>)}{!choices.length&&<p role="status">{empty}</p>}</div>}
 </div>
}
