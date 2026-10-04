const fail=()=>{throw Object.assign(Error('NOTICE_FIELDS'),{code:'NOTICE_FIELDS',statusCode:400})}
export function noticePhotos(value=[]){
 if(!Array.isArray(value)||value.length>5)fail()
 let total=0
 return value.map(p=>{
  if(typeof p?.dataUrl!=='string'||p.dataUrl.length>2800000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(p.dataUrl))fail()
  const bytes=Buffer.from(p.dataUrl.split(',')[1],'base64');total+=bytes.length
  if(bytes.length<4||bytes.length>2*1024*1024||total>8*1024*1024||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes.at(-2)!==255||bytes.at(-1)!==217)fail()
  return {name:String(p.name||'photo.jpg').slice(0,120),dataUrl:'data:image/jpeg;base64,'+bytes.toString('base64')}
 })
}
