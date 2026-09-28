import {useEffect,useRef} from 'react'
import {useI18n} from './i18n.jsx'
import {defaultMenuLayout,menuGroups,overviewMenuIds} from '../shared/menuLayout.js'
import MenuIcon from './MenuIcon.jsx'

export default function OverviewModules({preferences,items,go}){
 const{t}=useI18n(),ref=useRef(null),layout=preferences?.layout||defaultMenuLayout(),groups=menuGroups(layout)
 const allowed=id=>id==='special'||items.some(x=>x[0]===id)
 const label=id=>layout.pageNames?.[id]||t(id==='special'?'nav.special':items.find(x=>x[0]===id)?.[2]||'nav.dashboard')
 const selected=preferences?.shortcuts||overviewMenuIds(layout)
 const ordered=[...new Set([...layout.top.flatMap(id=>{const g=groups.find(g=>g.id===id);return g?[id,...g.items]:[id]}),'special'])]
 useEffect(()=>{let start=null;const down=e=>{start={x:e.clientX,y:e.clientY,target:e.target}};const up=e=>{if(!start||start.target!==e.target||Math.abs(e.clientX-start.x)+Math.abs(e.clientY-start.y)>8||window.getSelection()?.toString())return;for(const d of ref.current?.querySelectorAll('details[open]')||[])if(!d.contains(e.target))d.open=false;start=null};const key=e=>{if(e.key==='Escape')for(const d of ref.current?.querySelectorAll('details[open]')||[])d.open=false};document.addEventListener('pointerdown',down);document.addEventListener('pointerup',up);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',down);document.removeEventListener('pointerup',up);document.removeEventListener('keydown',key)}},[])
 return <div className="cards" ref={ref}>{ordered.filter(id=>selected.includes(id)).map(id=>{
  const group=groups.find(g=>g.id===id)
  if(group){const children=group.items.filter(allowed);if(!children.length)return null;return <details key={id} className="overview-folder"><summary className="card"><MenuIcon folder/><strong data-i18n-raw={group.name?true:undefined}>{group.name||t('menu.documents')}</strong></summary><div className="overview-folder-entries">{children.map(child=><button key={child} onClick={()=>go(child)}>{label(child)}</button>)}</div></details>}
  if(!allowed(id)||id==='dashboard')return null
  return <button key={id} className="card" onClick={()=>go(id)}><i className="green">{items.find(x=>x[0]===id)?.[1]||'↗'}</i><span><strong>{label(id)}</strong></span></button>
 })}</div>
}
