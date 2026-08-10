export function parseCoordinates(value){
  const match=String(value??'').trim().match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))$/)
  if(!match)throw new Error('Enter coordinates as latitude, longitude')
  const latitude=Number(match[1]),longitude=Number(match[2])
  if(latitude < -90||latitude > 90)throw new Error('Latitude must be between -90 and 90')
  if(longitude < -180||longitude > 180)throw new Error('Longitude must be between -180 and 180')
  return{latitude:String(latitude),longitude:String(longitude)}
}

export function validCoordinatePair(latitude,longitude){
  if(String(latitude??'').trim()===''||String(longitude??'').trim()==='')return false
  const lat=Number(latitude),lng=Number(longitude)
  return Number.isFinite(lat)&&lat>=-90&&lat<=90&&Number.isFinite(lng)&&lng>=-180&&lng<=180
}
