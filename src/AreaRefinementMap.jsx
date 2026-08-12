import {useEffect,useRef,useState} from 'react'
import {loadGoogleMaps} from './googleMapsLoader.js'
import {useI18n} from './i18n.jsx'
import {formatBranchId} from '../shared/typedIds.js'

const mapsKey=import.meta.env.VITE_GOOGLE_MAPS_API_KEY||''
const colors=['#16734a','#2563eb','#c2410c','#7c3aed','#b91c1c','#0f766e','#a16207','#be185d']

export default function AreaRefinementMap({items=[]}){
  const{t}=useI18n(),container=useRef(null),map=useRef(null),markers=useRef([]),[error,setError]=useState('')
  useEffect(()=>{let active=true;const points=items.filter(item=>Number.isFinite(item.latitude)&&Number.isFinite(item.longitude));if(!points.length)return
    loadGoogleMaps(mapsKey).then(maps=>{if(!active||!container.current)return;markers.current.forEach(marker=>marker.setMap(null));markers.current=[];const bounds=new maps.LatLngBounds(),names=[...new Set(points.map(item=>item.proposedAreaName||item.currentAreaName))]
      if(!map.current)map.current=new maps.Map(container.current,{mapTypeId:'roadmap',mapTypeControl:true,streetViewControl:false,fullscreenControl:false})
      const info=new maps.InfoWindow()
      for(const point of points){const position={lat:Number(point.latitude),lng:Number(point.longitude)},color=colors[Math.max(0,names.indexOf(point.proposedAreaName||point.currentAreaName))%colors.length],marker=new maps.Marker({map:map.current,position,title:`${formatBranchId(point.branchId)} — ${point.branchName}`,icon:{path:maps.SymbolPath.CIRCLE,fillColor:color,fillOpacity:1,strokeColor:'#fff',strokeWeight:2,scale:8}});marker.addListener('click',()=>{const content=document.createElement('div');for(const value of [`${formatBranchId(point.branchId)} — ${point.branchName}`,`Current: ${point.currentAreaName||'—'}`,`Suggested: ${point.proposedAreaName||'Needs Review'}`,`${point.latitude}, ${point.longitude}`,point.road||point.sublocality||point.locality||'—',`${point.confidence||'—'} — ${point.reason||'—'}`]){const line=document.createElement('div');line.textContent=value;content.append(line)}info.setContent(content);info.open({map:map.current,anchor:marker})});markers.current.push(marker);bounds.extend(position)}
      map.current.fitBounds(bounds);if(points.length===1)map.current.setZoom(16);setError('')
    }).catch(()=>active&&setError(t('areaRefinement.mapUnavailable')))
    return()=>{active=false}
  },[items,t])
  return <div className="area-refinement-map">{error?<p role="status">{error}</p>:<div ref={container} className="area-refinement-map-canvas" aria-label={t('areaRefinement.map')}/>}</div>
}
