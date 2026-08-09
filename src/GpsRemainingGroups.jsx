import {useEffect,useMemo,useState} from 'react'
import {formatBranchId,formatCustomerId} from '../shared/typedIds.js'
import {groupRemainingGpsByArea} from './gpsRemainingGroups.js'

export default function GpsRemainingGroups({items=[],onSelect,t}){
  const groups=useMemo(()=>groupRemainingGpsByArea(items,t('gpsCollection.unassignedArea')),[items,t])
  const [expanded,setExpanded]=useState(()=>groups[0]?.key||'')
  useEffect(()=>setExpanded(current=>groups.some(group=>group.key===current)?current:(groups[0]?.key||'')),[groups])
  if(!groups.length)return <p>{t('gpsCollection.none')}</p>
  return <div className="gps-area-groups">{groups.map(group=>{
    const open=expanded===group.key
    return <section className="gps-area-group" key={group.key}>
      <button type="button" className="gps-area-group-toggle" aria-expanded={open} onClick={()=>setExpanded(current=>current===group.key?'':group.key)}>
        <span><b data-i18n-raw>{group.label}</b>{group.zoneGroup&&<small data-i18n-raw>{group.zoneGroup}</small>}</span>
        <strong aria-label={t('gpsCollection.groupCount',{count:group.items.length})}>{group.items.length}</strong>
        <i aria-hidden="true">{open?'▾':'▸'}</i>
      </button>
      {open&&<div className="gps-area-branches">{group.items.map(branch=><button type="button" className="gps-branch-card" key={branch.internalId} onClick={()=>onSelect(branch)}>
        <b data-i18n-raw>{formatBranchId(branch.branchId)} — {branch.branchName}</b>
        <span data-i18n-raw>{formatCustomerId(branch.customerId)} — {branch.customerName}</span>
        <small data-i18n-raw>{branch.address||t('common.noAddress')}</small>
        <small data-i18n-raw>{branch.area||t('gpsCollection.unassignedArea')} / {branch.zoneGroup||'—'}</small>
      </button>)}</div>}
    </section>
  })}</div>
}
