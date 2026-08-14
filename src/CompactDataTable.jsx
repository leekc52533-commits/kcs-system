import {useEffect,useMemo,useRef,useState} from 'react'
import './CompactDataTable.css'

const valueOf=(column,item)=>column.value?column.value(item):item[column.key]
const normalized=value=>String(value??'').trim().toLocaleLowerCase()
const storageKey=preferenceKey=>`kcs.table-columns.v2.${preferenceKey}`
const defaultColumnKeys=columns=>columns.filter(column=>column.required||column.defaultVisible!==false).map(column=>column.key)

export function CopyValue({value,label,copiedLabel}){
  const[copied,setCopied]=useState(false)
  const copy=async event=>{
    event.stopPropagation()
    if(!value)return
    try{await navigator.clipboard.writeText(String(value))}catch{return}
    setCopied(true);window.setTimeout(()=>setCopied(false),1400)
  }
  return <span className="copy-value"><span data-i18n-raw>{value||'—'}</span>{value&&<button type="button" className={`copy-icon${copied?' copied':''}`} aria-label={`${label}: ${value}`} title={label} onClick={copy}>{copied?`✓ ${copiedLabel}`:'⧉'}</button>}</span>
}

const readColumns=(preferenceKey,columns)=>{
  const all=columns.map(column=>column.key),defaults=defaultColumnKeys(columns)
  if(!preferenceKey||typeof window==='undefined')return defaults
  try{const raw=window.localStorage.getItem(storageKey(preferenceKey));if(!raw)return defaults;const saved=JSON.parse(raw),allowed=new Set(all),required=columns.filter(column=>column.required).map(column=>column.key),visible=saved.filter(key=>allowed.has(key));return [...new Set([...required,...visible])]}catch{return defaults}
}

export default function CompactDataTable({items,rowKey,columns,renderDetails,renderActions,emptyLabel,labels,preferenceKey}){
  const[sort,setSort]=useState({key:'',direction:''}),[filters,setFilters]=useState({}),[selected,setSelected]=useState(()=>new Set()),[expanded,setExpanded]=useState(()=>new Set()),[visibleKeys,setVisibleKeys]=useState(()=>readColumns(preferenceKey,columns))
  const chooserRef=useRef(null)
  useEffect(()=>{if(!preferenceKey||typeof window==='undefined')return;window.localStorage.setItem(storageKey(preferenceKey),JSON.stringify(visibleKeys))},[preferenceKey,visibleKeys])
  useEffect(()=>{const close=event=>{if(chooserRef.current?.open&&!chooserRef.current.contains(event.target))chooserRef.current.removeAttribute('open')};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[])
  const visibleColumns=columns.filter(column=>column.required||visibleKeys.includes(column.key))
  const visible=useMemo(()=>{
    const filtered=items.filter(item=>columns.every(column=>{const chosen=filters[column.key]||[];return !chosen.length||chosen.includes(String(valueOf(column,item)??''))}))
    if(!sort.key)return filtered
    const column=columns.find(entry=>entry.key===sort.key)
    return [...filtered].sort((left,right)=>normalized(valueOf(column,left)).localeCompare(normalized(valueOf(column,right)),undefined,{numeric:true})*(sort.direction==='desc'?-1:1))
  },[items,columns,filters,sort])
  const keys=visible.map(item=>String(rowKey(item))),allSelected=keys.length>0&&keys.every(key=>selected.has(key))
  const toggleAll=()=>setSelected(current=>{const next=new Set(current);if(allSelected)keys.forEach(key=>next.delete(key));else keys.forEach(key=>next.add(key));return next})
  const toggleSelected=key=>setSelected(current=>{const next=new Set(current);if(next.has(key))next.delete(key);else next.add(key);return next})
  const toggleExpanded=key=>setExpanded(current=>{const next=new Set(current);if(next.has(key))next.delete(key);else next.add(key);return next})
  const applySort=(event,key,direction)=>{setSort(direction?{key,direction}:{key:'',direction:''});event.currentTarget.closest('details')?.removeAttribute('open')}
  const toggleFilter=(column,value)=>setFilters(current=>{const all=[...new Set(items.map(item=>String(valueOf(column,item)??'')))],chosen=current[column.key]||[],next=chosen.length?(chosen.includes(value)?chosen.filter(item=>item!==value):[...chosen,value]):all.filter(item=>item!==value);return{...current,[column.key]:next.length===all.length?[]:next}})
  const toggleColumn=column=>{if(column.required)return;setVisibleKeys(current=>{const next=current.includes(column.key)?current.filter(key=>key!==column.key):[...current,column.key];return next});if(sort.key===column.key)setSort({key:'',direction:''});setFilters(current=>({...current,[column.key]:[]}))}
  const resetColumns=()=>setVisibleKeys(defaultColumnKeys(columns))
  return <div className="compact-list-shell">
    <div className="compact-list-toolbar"><div className="compact-selection-summary" aria-live="polite">{labels.selected.replace('{count}',selected.size)}</div><details ref={chooserRef} className="column-chooser"><summary>▦ {labels.columns}</summary><div className="column-chooser-menu"><header><b>{labels.columns}</b><button type="button" aria-label={labels.closeColumns} onClick={()=>chooserRef.current?.removeAttribute('open')}>×</button></header>{columns.map(column=><label key={column.key}><input type="checkbox" checked={column.required||visibleKeys.includes(column.key)} disabled={column.required} onChange={()=>toggleColumn(column)}/><span>{column.label}</span></label>)}<button type="button" className="reset-columns" onClick={resetColumns}>{labels.resetColumns}</button></div></details></div>
    <div className="compact-table-scroll"><table className="compact-data-table"><thead><tr><th className="compact-check"><input type="checkbox" aria-label={labels.selectAll} checked={allSelected} onChange={toggleAll}/></th><th className="compact-expand-heading" aria-label={labels.details}><span aria-hidden="true">＋/−</span></th>{visibleColumns.map(column=>{const filterValues=column.filterable?[...new Set(items.map(item=>String(valueOf(column,item)??'')))].sort((a,b)=>normalized(a).localeCompare(normalized(b))):[],active=sort.key===column.key||Boolean(filters[column.key]?.length);return <th key={column.key} className={column.secondary?'compact-secondary':''}><details className={`compact-column-control${active?' active':''}`}><summary><span>{column.label}</span><span aria-hidden="true">{sort.key===column.key?(sort.direction==='asc'?'↑':'↓'):(filters[column.key]?.length?'●':'▼')}</span></summary><div className="compact-column-menu"><button type="button" onClick={event=>applySort(event,column.key,'asc')}>{labels.sortAsc}</button><button type="button" onClick={event=>applySort(event,column.key,'desc')}>{labels.sortDesc}</button><button type="button" onClick={event=>applySort(event,column.key,'')}>{labels.clearSort}</button>{column.filterable&&<><hr/><button type="button" onClick={()=>setFilters(current=>({...current,[column.key]:[]}))}>{labels.clearFilter}</button>{filterValues.map(value=><label key={value}><input type="checkbox" checked={!filters[column.key]?.length||filters[column.key].includes(value)} onChange={()=>toggleFilter(column,value)}/><span data-i18n-raw>{column.filterLabel?.(value)||value||'—'}</span></label>)}</>}</div></details></th>})}{renderActions&&<th>{labels.actions}</th>}</tr></thead>
      <tbody>{visible.map(item=>{const key=String(rowKey(item)),open=expanded.has(key);return <FragmentRow key={key} item={item} rowKey={key} open={open} selected={selected.has(key)} columns={visibleColumns} labels={labels} toggleSelected={toggleSelected} toggleExpanded={toggleExpanded} renderActions={renderActions} renderDetails={renderDetails}/>})}</tbody></table></div>
    {!visible.length&&<p className="compact-empty">{emptyLabel}</p>}
  </div>
}

function FragmentRow({item,rowKey,open,selected,columns,labels,toggleSelected,toggleExpanded,renderActions,renderDetails}){
  const activate=event=>{if(event.target.closest('button,input,a,summary,select'))return;toggleExpanded(rowKey)}
  return <><tr className={`compact-data-row interactive-row${open?' expanded':''}`} tabIndex="0" aria-expanded={open} onClick={activate} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleExpanded(rowKey)}}}><td className="compact-check"><input type="checkbox" aria-label={labels.selectRow} checked={selected} onChange={()=>toggleSelected(rowKey)} onClick={event=>event.stopPropagation()}/></td><td className="compact-expand"><button type="button" aria-label={open?labels.collapse:labels.expand} aria-expanded={open} onClick={event=>{event.stopPropagation();toggleExpanded(rowKey)}}>{open?'−':'+'}</button></td>{columns.map(column=><td key={column.key} className={column.secondary?'compact-secondary':''}>{column.render?column.render(item,{open,toggleDetails:()=>toggleExpanded(rowKey)}):<span data-i18n-raw>{valueOf(column,item)||'—'}</span>}</td>)}{renderActions&&<td className="compact-actions" onClick={event=>event.stopPropagation()}>{renderActions(item)}</td>}</tr>{open&&<tr className="compact-detail-row"><td colSpan={columns.length+2+(renderActions?1:0)}>{renderDetails(item)}</td></tr>}</>
}
