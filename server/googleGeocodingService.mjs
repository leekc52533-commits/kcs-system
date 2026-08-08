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
  if(data.status==='ZERO_RESULTS')return{address:'',state:'',street:'',city:'',streetNumber:'',postalCode:'',provider:'Google Geocoding API'}
  if(data.status!=='OK')throw safeError('Google could not return an address for this GPS. GPS coordinates are still available.')
  const result=data.results?.[0]||{},components=result.address_components||[]
  const component=(...types)=>components.find(item=>types.some(type=>item.types?.includes(type)))?.long_name||''
  return{
    address:result.formatted_address||'',
    state:component('administrative_area_level_1'),
    street:component('route'),
    city:component('locality','postal_town','administrative_area_level_2'),
    streetNumber:component('street_number'),
    postalCode:component('postal_code'),
    provider:'Google Geocoding API',
  }
}
