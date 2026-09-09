import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const run=promisify(execFile)
let reading=false
export function parseExpenseReceipt(text,vehicles=[]){
 const lines=String(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean),fields={}
 const find=re=>lines.map(line=>line.match(re)).find(Boolean)?.[1]?.trim()
 const total=find(/^(?:grand\s+total|total\s+(?:amount|payable)|amount\s+(?:due|payable)|jumlah|total)\s*[:=]?\s*(?:RM\s*)?([\d,]+\.\d{2})\s*$/i)
 if(total&&Number(total.replaceAll(',',''))>0)fields.amount=total.replaceAll(',','')
 const invoice=find(/^(?:tax\s+)?(?:invoice|inv|receipt|resit)\s*(?:no\.?|number|#)\s*[:#=-]?\s*([A-Z0-9][A-Z0-9\-/]{1,149})\s*$/i)
 if(invoice)fields.referenceNumber=invoice
 const company=find(/^(?:company\s+name|supplier|merchant|nama\s+syarikat)\s*:\s*(.{2,250})$/i)
 const named=lines.filter(line=>/\bSDN\.?\s*BHD\.?\s*$/i.test(line)&&line.length<=250)
 if(company||named.length===1)fields.companyName=company||named[0]
 const tin=find(/^(?:supplier\s+)?(?:TIN|tax\s+identification\s+number)\s*(?:no\.?|number)?\s*[:#=-]\s*([A-Z0-9-]{3,100})\s*$/i)
 if(tin)fields.tinNumber=tin
 const meter=find(/^(?:odometer|mileage|meter(?:\s+number)?|bacaan\s+meter)\s*[:=]?\s*([\d,]+(?:\.\d+)?)\s*(?:km)?\s*$/i)
 if(meter&&Number(meter.replaceAll(',',''))<=10000000)fields.odometerKm=meter.replaceAll(',','')
 const plate=find(/^(?:vehicle|car|registration|plate)\s*(?:no\.?|number)?\s*[:#=-]\s*([A-Z0-9 -]+)$/i)
 if(plate){const normalize=s=>String(s).toUpperCase().replace(/[^A-Z0-9]/g,''),matches=vehicles.filter(v=>v.registrationNumber&&normalize(v.registrationNumber)===normalize(plate));if(matches.length===1)fields.vehicleId=String(matches[0].id)}
 return fields
}
export async function recognizeExpenseReceipt(proof,vehicles=[]){
 const match=String(proof?.dataUrl||'').match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/)
 if(!match)throw Object.assign(Error('INVALID_PHOTO'),{code:'INVALID_PHOTO',statusCode:400})
 const bytes=Buffer.from(match[2],'base64');if(!bytes.length||bytes.length>8_000_000)throw Object.assign(Error('INVALID_PHOTO'),{code:'INVALID_PHOTO',statusCode:400})
 if(reading)return{status:'busy',fields:{}}
 reading=true;let folder
 try{folder=await fs.mkdtemp(path.join(os.tmpdir(),'kcs-receipt-'));const file=path.join(folder,'receipt.'+match[1]);await fs.writeFile(file,bytes,{mode:0o600});const {stdout}=await run(process.env.KCS_TESSERACT_PATH||'tesseract',[file,'stdout','-l','eng','--psm','6'],{timeout:30000,maxBuffer:1_000_000});const fields=parseExpenseReceipt(stdout,vehicles);return{status:Object.keys(fields).length?'review':'unreadable',fields}}
 catch(e){return{status:e.code==='ENOENT'?'unavailable':'unreadable',fields:{}}}
 finally{reading=false;if(folder)await fs.rm(folder,{recursive:true,force:true})}
}
