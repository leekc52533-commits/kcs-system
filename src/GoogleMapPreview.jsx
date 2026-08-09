import {useEffect,useRef,useState} from 'react'
import {useI18n} from './i18n.jsx'
import {loadGoogleMaps} from './googleMapsLoader.js'

const mapsKey=import.meta.env.VITE_GOOGLE_MAPS_API_KEY||''

export default function GoogleMapPreview({latitude,longitude}){
  const{t}=useI18n(),container=useRef(null),map=useRef(null),marker=useRef(null),[error,setError]=useState('')
  useEffect(()=>{
    if(!latitude||!longitude)return
    const position={lat:Number(latitude),lng:Number(longitude)}
    if(!Number.isFinite(position.lat)||!Number.isFinite(position.lng))return
    let current=true
    loadGoogleMaps(mapsKey).then(maps=>{
      if(!current||!container.current)return
      if(!map.current){map.current=new maps.Map(container.current,{center:position,zoom:17,mapTypeControl:false,streetViewControl:false,fullscreenControl:false});marker.current=new maps.Marker({map:map.current,position,title:'Captured GPS'})}
      else{map.current.setCenter(position);marker.current.setPosition(position)}
      setError('')
    }).catch(reason=>{console.error('[KCS Google Maps]',reason?.message||'unknown-error');if(current)setError(reason.message==='missing-key'?t('gpsCollection.mapKeyMissing'):t('gpsCollection.mapLoadFailed'))})
    return()=>{current=false}
  },[latitude,longitude,t])
  if(!latitude||!longitude)return null
  return <div className="google-map-preview">{error?<p role="status">{error}</p>:<div ref={container} className="google-map-canvas" aria-label={t('gpsCollection.mapPreview')}/>}</div>
}
