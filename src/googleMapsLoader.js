const callbackName='__kcsGoogleMapsReady'
const loaders=new WeakMap()

export function loadGoogleMaps(mapsKey,{runtime=globalThis,documentRef=globalThis.document,timeoutMs=20000}={}){
  if(runtime.google?.maps)return Promise.resolve(runtime.google.maps)
  if(!mapsKey)return Promise.reject(new Error('missing-key'))
  const current=loaders.get(documentRef)
  if(current)return current
  const promise=new Promise((resolve,reject)=>{
    let settled=false,timer,script
    const finish=(handler,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(runtime[callbackName]===ready)delete runtime[callbackName];handler(value)}
    const fail=error=>{script?.remove?.();finish(reject,error)}
    const ready=()=>runtime.google?.maps?finish(resolve,runtime.google.maps):fail(new Error('api-not-ready'))
    runtime[callbackName]=ready
    script=documentRef.querySelector('script[data-kcs-google-maps]')
    if(!script){
      script=documentRef.createElement('script')
      script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsKey)}&loading=async&callback=${callbackName}`
      script.async=true
      script.dataset.kcsGoogleMaps='true'
      script.addEventListener('error',()=>fail(new Error('script-load-error')),{once:true})
      documentRef.head.append(script)
    }else{
      script.addEventListener('error',()=>fail(new Error('script-load-error')),{once:true})
    }
    timer=setTimeout(()=>runtime.google?.maps?ready():fail(new Error('api-ready-timeout')),timeoutMs)
  })
  loaders.set(documentRef,promise)
  promise.catch(()=>loaders.delete(documentRef))
  return promise
}
