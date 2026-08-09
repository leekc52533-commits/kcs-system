export function positionReading(position){return{latitude:position.coords.latitude.toFixed(7),longitude:position.coords.longitude.toFixed(7),accuracyM:Math.round(position.coords.accuracy),deviceCapturedAt:new Date(position.timestamp).toISOString()}}

export function collectHighAccuracyPosition(geolocation,{durationMs=12000,timeoutMs=20000,targetAccuracy=20,minSamples=3,onSample=()=>{}}={}){
  if(!geolocation?.watchPosition)return Promise.reject(new Error('gps-unsupported'))
  return new Promise((resolve,reject)=>{
    let best=null,samples=0,watchId,timer,finished=false
    const finish=(error)=>{if(finished)return;finished=true;clearTimeout(timer);if(watchId!=null)geolocation.clearWatch(watchId);if(best)resolve(best);else reject(error||new Error('gps-timeout'))}
    watchId=geolocation.watchPosition(position=>{const reading=positionReading(position);samples+=1;if(!best||reading.accuracyM<best.accuracyM){best=reading;onSample(reading,samples)}if(samples>=minSamples&&best.accuracyM<=targetAccuracy)finish()},error=>finish(error),{enableHighAccuracy:true,timeout:timeoutMs,maximumAge:0})
    timer=setTimeout(()=>finish(),durationMs)
  })
}
