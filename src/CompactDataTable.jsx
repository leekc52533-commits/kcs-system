import {useMemo,useState} from 'react'
import './CompactDataTable.css'

const valueOf=(column,item)=>column.value?column.value(item):item[column.key]
const normalized=value=>String(value??'').trim().toLocaleLowerCase()

export function CopyValue({value,label,onCopied}){
  const[copied,setCopied]=useState(false)
  const copy=async event=>{
    event.stopPropagation()
    if(!value)return
    try{await navigator.clipboard.writeText(String(value))}catch{return}
    setCopied(true);onCopied?.();window.setTimeout(()=>setCopied(false),1400)
  }
  return <span className="copy-value"><span data-i18n-raw>{value||'—'}</span>{value&&<button type="button" className="copy-icon" aria-label={`${label}: ${value}`} title={label} onClick={copy}>{copied?'✓':'⧉'}</button>}</span>
}

export default function CompactDataTable({items,rowKey,columns,renderDetails,renderActions,emptyLabel,labels}){
  const[sort,setSort]=useState({key:'',direction:''}),[filters,setFilters]=useState({}),[selected,setSelected]=useState(()=>new Set()),[expanded,setExpanded]=useState(()=>new Set())
  const visible=useMemo(()=>{
    const filtered=items.filter(item=>columns.every(column=>{
      const chosen=filters[column.key]||[]
      return !chosen.length||chosen.includes(String(valueOf(column,item)??''))
    }))
    if(!sort.key)return filtered
    const column=columns.find(entry=>entry.key===sort.key)
    return [...filtered].sort((left,right)=>normalized(valueOf(column,left)).localeCompare(normalized(valueOf(column,right)),undefined,{numeric:true})*(sort.direction==='desc'?-1:1))
  },[items,columns,filters,sort])
  const keys=visible.map(item=>String(rowKey(item))),allSelected=keys.length>0&&keys.every(key=>selected.has(key))
  const toggleAll=()=>setSelected(current=>{const next=new Set(current);if(allSelected)keys.forEach(key=>next.delete(key));else keys.forEach(key=>next.add(key));return next})
  const toggleSelected=key=>setSelected(current=>{const next=new Set(current);if(next.has(key))next.delete(key);else next.add(key);return next})
  const toggleExpanded=key=>setExpanded(current=>{const next=new Set(current);if(next.has(key))next.delete(key);else next.add(key);return next})
  const setDirection=(key,direction)=>setSort(direction?{key,direction}:{key:'',direction:''})
  const toggleFilter=(column,value)=>setFilters(current=>{const all=[...new Set(items.map(item=>String(valueOf(column,item)??'')))],chosen=current[column.key]||[],next=chosen.length?(chosen.includes(value)?chosen.filter(item=>item!==value):[...chosen,value]):all.filter(item=>item!==value);return{...current,[column.key]:next.length===all.length?[]:next}})
  return <div className="compact-list-shell">
    <div className="compact-selection-summary" aria-live="polite">{labels.selected.replace('{count}',selected.size)}</div>
    <div className="compact-table-scroll"><table className="compact-data-table"><thead><tr><th className="compact-check"><input type="checkbox" aria-label={labels.selectAll} checked={allSelected} onChange={toggleAll}/></th>{columns.map(column=>{const filterValues=column.filterable?[...new Set(items.map(item=>String(valueOf(column,item)??'')))].sort((a,b)=>normalized(a).localeCompare(normalized(b))):[],active=sort.key===column.key||Boolean(filters[column.key]?.length);return <th key={column.key} className={column.secondary?'compact-secondary':''}><details className={`compact-column-control${active?' active':''}`}><summary><span>{column.label}</span><span aria-hidden="true">{sort.key===column.key?(sort.direction==='asc'?'↑':'↓'):(filters[column.key]?.length?'●':'▼')}</span></summary><div className="compact-column-menu"><button type="button" onClick={()=>setDirection(column.key,'asc')}>{labels.sortAsc}</button><button type="button" onClick={()=>setDirection(column.key,'desc')}>{labels.sortDesc}</button><button type="button" onClick={()=>setDirection(column.key,'')}>{labels.clearSort}</button>{column.filterable&&<><hr/><button type="button" onClick={()=>setFilters(current=>({...current,[column.key]:[]}))}>{labels.clearFilter}</button>{filterValues.map(value=><label key={value}><input type="checkbox" checked={!filters[column.key]?.length||filters[column.key].includes(value)} onChange={()=>toggleFilter(column,value)}/><span data-i18n-raw>{column.filterLabel?.(value)||value||'—'}</span></label>)}</>}</div></details></th>})}<th>{labels.actions}</th><th className="compact-expand-heading">{labels.details}</th></tr></thead>
      <tbody>{visible.map(item=>{const key=String(rowKey(item)),open=expanded.has(key);return <FragmentRow key={key} item={item} rowKey={key} open={open} selected={selected.has(key)} columns={columns} labels={labels} toggleSelected={toggleSelected} toggleExpanded={toggleExpanded} renderActions={renderActions} renderDetails={renderDetails}/>})}</tbody></table></div>
    {!visible.length&&<p className="compact-empty">{emptyLabel}</p>}
  </div>
}

function FragmentRow({item,rowKey,open,selected,columns,labels,toggleSelected,toggleExpanded,renderActions,renderDetails}){
  const activate=event=>{if(event.target.closest('button,input,a,summary,select'))return;toggleExpanded(rowKey)}
  return <><tr className={`compact-data-row interactive-row${open?' expanded':''}`} tabIndex="0" aria-expanded={open} onClick={activate} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleExpanded(rowKey)}}}><td className="compact-check"><input type="checkbox" aria-label={labels.selectRow} checked={selected} onChange={()=>toggleSelected(rowKey)} onClick={event=>event.stopPropagation()}/></td>{columns.map(column=><td key={column.key} className={column.secondary?'compact-secondary':''}>{column.render?column.render(item):<span data-i18n-raw>{valueOf(column,item)||'—'}</span>}</td>)}<td className="compact-actions" onClick={event=>event.stopPropagation()}>{renderActions?.(item)}</td><td className="compact-expand"><button type="button" aria-label={open?labels.collapse:labels.expand} aria-expanded={open} onClick={event=>{event.stopPropagation();toggleExpanded(rowKey)}}>{open?'−':'+'}</button></td></tr>{open&&<tr className="compact-detail-row"><td colSpan={columns.length+3}>{renderDetails(item)}</td></tr>}</>
}
