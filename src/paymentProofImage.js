const SOURCE_LIMIT=25*1024*1024
const OUTPUT_LIMIT=3*1024*1024
const MAX_EDGE=2200
const supported=new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif'])

const canvasBlob=(canvas,type,quality)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('The browser could not compress this photo.')) ,type,quality))

export async function processPaymentProof(file,{createBitmap=globalThis.createImageBitmap,createCanvas=()=>document.createElement('canvas')}={}){
  if(!file)throw new Error('Select a payment proof photo.')
  const type=String(file.type||'').toLowerCase()
  if(!supported.has(type))throw new Error('Unsupported photo format. Use JPEG, PNG, HEIC or WebP.')
  if(!file.size||file.size>SOURCE_LIMIT)throw new Error('The original photo is too large. Use a photo smaller than 25 MB.')
  if(typeof createBitmap!=='function')throw new Error('This browser cannot process camera photos. Update Chrome or choose a JPEG screenshot.')
  let bitmap
  try{bitmap=await createBitmap(file,{imageOrientation:'from-image'})}catch{throw new Error(type==='image/heic'||type==='image/heif'?'This phone cannot decode HEIC. Set the camera to JPEG or upload a screenshot.':'This photo could not be read. Retake it or choose a JPEG/PNG image.')}
  try{
    const scale=Math.min(1,MAX_EDGE/Math.max(bitmap.width,bitmap.height)),canvas=createCanvas();canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const context=canvas.getContext('2d',{alpha:false});if(!context)throw new Error('The browser could not prepare this photo.');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height)
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
