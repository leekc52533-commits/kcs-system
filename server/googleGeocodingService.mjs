const safeError=(message,statusCode=502)=>Object.assign(new Error(message),{statusCode})

export async function reverseGeocodeGoogle(latitude,longitude,{fetchImpl=fetch,apiKey=process.env.GOOGLE_GEOCODING_API_KEY}={}){
  const lat=Number(latitude),lon=Number(longitude)
  if(!Number.isFinite(lat)||lat < -90||lat>90||!Number.isFinite(lon)||lon < -180||lon>180)throw safeError('Invalid GPS latitude or longitude',400)
  if(!apiKey)throw safeError('Address lookup is unavailable because the Google Geocoding key is not configured.',503)
  const endpoint=new URL('https://maps.googleapis.com/maps/api/geocode/json')
  endpoint.search=new URLSearchParams({latlng:`${lat},${lon}`,key:apiKey})
  let response
  try{response=await fetchImpl(endpoint)}catch{throw safeError('Address lookup is temporarily unavailable. GPS coordinates are still available.')}
  if(!response.ok)throw safeError('Address lookup is temporarily unavailable. GPS coordinates are still available.')
  const data=await response.json()
  if(data.status==='ZERO_RESULTS')return{address:'',state:'',street:'',city:'',streetNumber:'',postalCode:'',country:'',countryCode:'',partialMatch:false,locationType:'',placeId:'',resultTypes:[],provider:'Google Geocoding API'}
  if(data.status!=='OK')throw safeError('Google could not return an address for this GPS. GPS coordinates are still available.')
  const result=data.results?.[0]||{},components=result.address_components||[]
  const componentRow=(...types)=>components.find(item=>types.some(type=>item.types?.includes(type)))||{}
  const component=(...types)=>componentRow(...types).long_name||''
  const country=componentRow('country')
  return{
    address:result.formatted_address||'',
    state:component('administrative_area_level_1'),
    street:component('route'),
    city:component('locality','postal_town','administrative_area_level_2'),
    locality:component('locality','postal_town'),
    sublocality:component('sublocality_level_1','sublocality','neighborhood'),
    streetNumber:component('street_number'),
    postalCode:component('postal_code'),
    country:country.long_name||'',
    countryCode:country.short_name||'',
    partialMatch:Boolean(result.partial_match),
    locationType:result.geometry?.location_type||'',
    placeId:result.place_id||'',
    resultTypes:Array.isArray(result.types)?result.types:[],
    provider:'Google Geocoding API',
  }
}

export async function geocodeGoogleAddress(address,{fetchImpl=fetch,apiKey=process.env.GOOGLE_GEOCODING_API_KEY}={}){
  const query=String(address??'').trim();if(!query)throw safeError('Enter an address to search.',400);if(!apiKey)throw safeError('Map search is unavailable because the Google Geocoding key is not configured.',503)
  const endpoint=new URL('https://maps.googleapis.com/maps/api/geocode/json');endpoint.search=new URLSearchParams({address:query,key:apiKey});let response
  try{response=await fetchImpl(endpoint)}catch{throw safeError('Map search is temporarily unavailable.')}
  if(!response.ok)throw safeError('Map search is temporarily unavailable.');const data=await response.json();if(data.status==='ZERO_RESULTS')throw safeError('No matching location was found.',404);if(data.status!=='OK')throw safeError('Google could not search for this location.')
  const candidates=(data.results||[]).map((result,index)=>({id:String(result.place_id||index),name:(result.address_components||[]).find(item=>item.types?.includes('establishment'))?.long_name||result.formatted_address||query,address:result.formatted_address||query,latitude:String(result.geometry?.location?.lat??''),longitude:String(result.geometry?.location?.lng??'')})).filter(item=>Number.isFinite(Number(item.latitude))&&Number.isFinite(Number(item.longitude)))
  if(!candidates.length)throw safeError('Google returned an invalid map location.')
  return{candidates,provider:'Google Geocoding API'}
}
