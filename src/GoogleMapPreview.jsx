import {useEffect,useRef,useState} from 'react'
import {useI18n} from './i18n.jsx'
import {loadGoogleMaps} from './googleMapsLoader.js'

const mapsKey=import.meta.env.VITE_GOOGLE_MAPS_API_KEY||''

export default function GoogleMapPreview({latitude,longitude,onPositionAdjusted,onMapClick,initialCenter=null}){
  const{t}=useI18n(),container=useRef(null),map=useRef(null),marker=useRef(null),adjustmentHandler=useRef(onPositionAdjusted),mapClickHandler=useRef(onMapClick),[error,setError]=useState(''),initialLatitude=initialCenter?.lat,initialLongitude=initialCenter?.lng
  adjustmentHandler.current=onPositionAdjusted
  mapClickHandler.current=onMapClick
  useEffect(()=>{
    const hasPosition=latitude!==''&&latitude!=null&&longitude!==''&&longitude!=null&&Number.isFinite(Number(latitude))&&Number.isFinite(Number(longitude))
    if(!hasPosition&&(initialLatitude==null||initialLongitude==null))return
    const position=hasPosition?{lat:Number(latitude),lng:Number(longitude)}:{lat:initialLatitude,lng:initialLongitude}
    let current=true
    loadGoogleMaps(mapsKey).then(maps=>{
      if(!current||!container.current)return
      const createMarker=()=>{marker.current=new maps.Marker({map:map.current,position,title:'Selected GPS',draggable:Boolean(adjustmentHandler.current)});marker.current.addListener('dragend',event=>adjustmentHandler.current?.({latitude:event.latLng.lat().toFixed(7),longitude:event.latLng.lng().toFixed(7)}))}
      if(!map.current){map.current=new maps.Map(container.current,{center:position,zoom:hasPosition?17:12,mapTypeId:'roadmap',mapTypeControl:true,streetViewControl:false,fullscreenControl:false});if(hasPosition)createMarker();map.current.addListener('click',event=>mapClickHandler.current?.({latitude:event.latLng.lat().toFixed(7),longitude:event.latLng.lng().toFixed(7)}))}
      else if(hasPosition){map.current.setCenter(position);if(!marker.current)createMarker();else{marker.current.setPosition(position);marker.current.setDraggable(Boolean(adjustmentHandler.current))}}
      setError('')
    }).catch(reason=>{console.error('[KCS Google Maps]',reason?.message||'unknown-error');if(current)setError(reason.message==='missing-key'?t('gpsCollection.mapKeyMissing'):t('gpsCollection.mapLoadFailed'))})
    return()=>{current=false}
  },[latitude,longitude,t,initialLatitude,initialLongitude])
  if((!latitude||!longitude)&&!initialCenter)return null
  return <div className="google-map-preview">{error?<p role="status">{error}</p>:<div ref={container} className="google-map-canvas" aria-label={t('gpsCollection.mapPreview')}/>}</div>
}
