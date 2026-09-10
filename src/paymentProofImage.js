const SOURCE_LIMIT=25*1024*1024
const OUTPUT_LIMIT=3*1024*1024
const MAX_EDGE=2200
const supported=new Set(['image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif'])

const canvasBlob=(canvas,type,quality)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('The browser could not compress this photo.')) ,type,quality))

const htmlImage=file=>new Promise((resolve,reject)=>{
  if(typeof Image!=='function'||!globalThis.URL?.createObjectURL)return reject(new Error('This browser cannot decode camera photos.'))
  const url=URL.createObjectURL(file),image=new Image()
  image.onload=()=>{URL.revokeObjectURL(url);resolve({width:image.naturalWidth,height:image.naturalHeight,source:image,close(){}})}
  image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('This photo could not be read.'))}
  image.src=url
})

export async function processPaymentProof(file,{preserveJpeg=false,createBitmap=globalThis.createImageBitmap,createCanvas=()=>document.createElement('canvas'),loadImage=htmlImage}={}){
  if(!file)throw new Error('Select a payment proof photo.')
  if(!file.size||file.size>SOURCE_LIMIT)throw new Error('The original photo is too large. Use a photo smaller than 25 MB.')
  let type=String(file.type||'').toLowerCase()
  // Some Android camera providers omit the MIME type. Inspect bytes, not the
  // extension, so a PDF renamed to .jpg is still rejected.
  if((!type||type==='application/octet-stream')&&file.slice){
    const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer()),ascii=(start,end)=>String.fromCharCode(...bytes.slice(start,end))
    if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)type='image/jpeg'
    else if(bytes[0]===137&&ascii(1,4)==='PNG'&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10)type='image/png'
    else if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')type='image/webp'
    else if(ascii(4,8)==='ftyp'&&['heic','heix','hevc','hevx','mif1'].includes(ascii(8,12)))type='image/heic'
    if(supported.has(type)){const name=file.name;file=new File([file],name||'camera',{type})}
  }
  if(!supported.has(type))throw new Error('Unsupported photo format. Use JPEG, PNG, HEIC or WebP.')
  let bitmap
  if(typeof createBitmap==='function'){
    try{bitmap=await createBitmap(file,{imageOrientation:'from-image'})}catch{try{bitmap=await createBitmap(file)}catch{/* Use the broadly supported HTML Image fallback below. */}}
  }
  if(!bitmap){try{bitmap=await loadImage(file)}catch{throw new Error(type==='image/heic'||type==='image/heif'?'This phone cannot decode HEIC. Set the camera to JPEG or upload a screenshot.':'This photo could not be read. Retake it or choose a JPEG/PNG image.')}}
  try{
    // Sales dot-matrix text can lose strokes on a second JPEG encoding.
    // Decode first to validate the image; retain original bytes only within both limits.
    if(preserveJpeg&&['image/jpeg','image/jpg'].includes(type)&&file.size<=OUTPUT_LIMIT&&Math.max(bitmap.width,bitmap.height)<=MAX_EDGE){
      return{blob:file,name:String(file.name||'sales-bill').replace(/\.[^.]+$/, '')+'.jpg',type:'image/jpeg',width:bitmap.width,height:bitmap.height,originalSize:file.size}
    }
    const source=bitmap.source||bitmap,scale=Math.min(1,MAX_EDGE/Math.max(bitmap.width,bitmap.height)),canvas=createCanvas();canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const context=canvas.getContext('2d',{alpha:false});if(!context)throw new Error('The browser could not prepare this photo.');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(source,0,0,canvas.width,canvas.height)
    let blob
    for(const quality of [.88,.8,.72,.64]){blob=await canvasBlob(canvas,'image/jpeg',quality);if(blob.size<=OUTPUT_LIMIT)break}
    if(!blob||blob.size>OUTPUT_LIMIT)throw new Error('The compressed proof is still too large. Retake it at a lower camera resolution.')
    return{blob,name:String(file.name||'payment-proof').replace(/\.[^.]+$/, '')+'.jpg',type:'image/jpeg',width:canvas.width,height:canvas.height,originalSize:file.size}
  }finally{bitmap.close?.()}
}

export const proofData=proof=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:proof.name,dataUrl:reader.result});reader.onerror=()=>reject(new Error('The processed proof could not be prepared for upload.'));reader.readAsDataURL(proof.blob)})

export function loadBillDraft(stopId,storage=globalThis.sessionStorage){try{return JSON.parse(storage?.getItem(`kcs-bill-draft:${stopId}`)||'null')}catch{return null}}
export function saveBillDraft(stopId,draft,storage=globalThis.sessionStorage){try{storage?.setItem(`kcs-bill-draft:${stopId}`,JSON.stringify(draft))}catch{/* Private/low-storage mode: server Bill remains the source of truth. */}}
export function clearBillDraft(stopId,storage=globalThis.sessionStorage){try{storage?.removeItem(`kcs-bill-draft:${stopId}`)}catch{/* no-op */}}
