import {useEffect,useRef,useState} from 'react'
import {useI18n} from './i18n.jsx'

const mapsKey=import.meta.env.VITE_GOOGLE_MAPS_API_KEY||''
let googleMapsPromise

function loadGoogleMaps(){
  if(globalThis.google?.maps)return Promise.resolve(globalThis.google.maps)
  if(!mapsKey)return Promise.reject(new Error('missing-key'))
  if(!googleMapsPromise)googleMapsPromise=new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-kcs-google-maps]')
    if(existing){existing.addEventListener('load',()=>resolve(globalThis.google.maps),{once:true});existing.addEventListener('error',reject,{once:true});return}
    const script=document.createElement('script')
    script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsKey)}&loading=async`
    script.async=true
    script.dataset.kcsGoogleMaps='true'
    script.addEventListener('load',()=>globalThis.google?.maps?resolve(globalThis.google.maps):reject(new Error('load-failed')),{once:true})
    script.addEventListener('error',()=>reject(new Error('load-failed')),{once:true})
    document.head.append(script)
  })
  return googleMapsPromise
}

export default function GoogleMapPreview({latitude,longitude}){
  const{t}=useI18n(),container=useRef(null),map=useRef(null),marker=useRef(null),[error,setError]=useState('')
  useEffect(()=>{
    if(!latitude||!longitude)return
    const position={lat:Number(latitude),lng:Number(longitude)}
    if(!Number.isFinite(position.lat)||!Number.isFinite(position.lng))return
    let current=true
    loadGoogleMaps().then(maps=>{
      if(!current||!container.current)return
      if(!map.current){map.current=new maps.Map(container.current,{center:position,zoom:17,mapTypeControl:false,streetViewControl:false,fullscreenControl:false});marker.current=new maps.Marker({map:map.current,position,title:'Captured GPS'})}
      else{map.current.setCenter(position);marker.current.setPosition(position)}
      setError('')
    }).catch(reason=>current&&setError(reason.message==='missing-key'?t('gpsCollection.mapKeyMissing'):t('gpsCollection.mapLoadFailed')))
    return()=>{current=false}
  },[latitude,longitude,t])
  if(!latitude||!longitude)return null
  return <div className="google-map-preview">{error?<p role="status">{error}</p>:<div ref={container} className="google-map-canvas" aria-label={t('gpsCollection.mapPreview')}/>}</div>
}
