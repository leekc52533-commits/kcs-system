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

// Text Search finds businesses as well as street addresses. Keys stay server-side.
export async function searchGooglePlaces(query,{fetchImpl=fetch,apiKey=process.env.GOOGLE_PLACES_API_KEY||process.env.GOOGLE_GEOCODING_API_KEY}={}){
  const textQuery=String(query??'').trim()
  if(!textQuery)throw safeError('Enter a customer name or address to search.',400)
  if(!apiKey)throw safeError('Map search requires a Google Places API key.',503)
  let response,data
  try{
    response=await fetchImpl('https://places.googleapis.com/v1/places:searchText',{
      method:'POST',signal:AbortSignal.timeout(15000),
      headers:{'Content-Type':'application/json','X-Goog-Api-Key':apiKey,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.location'},
      body:JSON.stringify({textQuery,languageCode:'en',regionCode:'MY',pageSize:20,locationBias:{circle:{center:{latitude:1.5533,longitude:110.3592},radius:50000}}})
    })
    if(response.status===403||response.status===401)throw safeError('Enable Places API (New) and authorize the server API key in Google Cloud.',503)
    if(!response.ok)throw safeError('Map search is temporarily unavailable.')
    data=await response.json()
  }catch(error){if(error.statusCode)throw error;throw safeError('Map search is temporarily unavailable.')}
  const candidates=(data.places||[]).filter(place=>{
    const lat=place.location?.latitude,lon=place.location?.longitude
    return typeof lat==='number'&&Number.isFinite(lat)&&Math.abs(lat)<=90&&typeof lon==='number'&&Number.isFinite(lon)&&Math.abs(lon)<=180
  }).map((place,index)=>({id:String(place.id||index),name:place.displayName?.text||place.formattedAddress||textQuery,address:place.formattedAddress||'',latitude:String(place.location.latitude),longitude:String(place.location.longitude)}))
  if(!candidates.length)throw safeError('No matching location was found.',404)
  return{candidates,provider:'Google Places API'}
}
