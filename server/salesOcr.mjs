import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {image} from './driverExecutionService.mjs'
import {validSalesDate,salesLineCents} from '../shared/sales.js'
const run=promisify(execFile)
let reading=false
const normalize=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'')
const distance=(a,b)=>{let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next}return row[b.length]}
const decimal=s=>String(s||'').replaceAll(',','')
export function parseSalesOcr(text,masters={buyers:[],vehicles:[]}){
 const raw=String(text),lines=raw.split(/\r?\n/).map(s=>s.trim()),fields={lines:[]}
 const dateLine=lines.find(l=>/\bDate\b/i.test(l)),date=dateLine?.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
 if(date){const iso=`${date[3]}-${date[2].padStart(2,'0')}-${date[1].padStart(2,'0')}`;if(validSalesDate(iso))fields.settlementDate=iso}
 const number=raw.match(/\bCP\s*[-:]\s*(\d{8,})\b/i)||raw.match(/(?:Invoice|Settlement)\s*(?:No\.?|Number|#)\s*[:=-]?\s*([A-Z0-9][A-Z0-9/-]+)/i)
 if(number)fields.billNumber=number[0].match(/^CP/i)?'CP-'+number[1]:number[1]
 const name=lines.find(l=>/\b(?:SDN|SON)\s+(?:BHD|RHD)\b/i.test(l));if(name)fields.factoryText=name
 const buyers=masters.buyers.filter(b=>lines.some(l=>normalize(l).includes(normalize(b.name))));if(buyers.length===1)fields.buyerId=String(buyers[0].id)
 if(!fields.buyerId&&name){const header=normalize(name.split(/(?:BHD|RHD)/i)[0]+'BHD');const matches=masters.buyers.filter(b=>{const n=normalize(b.name);if(n.length<8)return false;for(let start=0;start<header.length;start++)for(let len=n.length-2;len<=n.length+2;len++)if(distance(n,header.slice(start,start+len))<=Math.floor(n.length*.15))return true;return false});if(matches.length===1)fields.buyerId=String(matches[0].id)}
 const vehicles=masters.vehicles.filter(v=>v.plate&&lines.some(l=>l.toUpperCase().split(/[^A-Z0-9]+/).some(token=>token===normalize(v.plate)||token.replace(/^O/,'Q')===normalize(v.plate))));if(vehicles.length===1)fields.vehicleId=String(vehicles[0].id)
 const total=lines.findLast(l=>/Final\s*Total/i.test(l))?.match(/([\d,]+\.\d{2,3})/);if(total)fields.total=Number(decimal(total[1])).toFixed(2)
 for(const line of lines){
  if(!/\b(?:KG|TN)\b/i.test(line)||!/\d/.test(line)||/UOM|U\/\s*Price/i.test(line))continue
  const slip=line.match(/\bTN\s*[- ]?\s*(\d+)\b/i),delivery=line.match(/\b(\d{2})\/(\d{2})\b/)
  if(!slip&&!/CORRUGATED|BOX/i.test(line))continue
  const numeric=[...line.matchAll(/\b(\d[\d,]*\.\d{2,6})\b/g)].map(m=>decimal(m[1]))
  const desc=line.match(/(?:^|\s)([A-Z][A-Z /-]+?)\s+\d{2}\/\d{2}/i)?.[1]?.trim()||''
  let deliveryDate='';if(delivery&&fields.settlementDate){const year=Number(fields.settlementDate.slice(0,4)),md=`${delivery[2]}-${delivery[1]}`;const guess=`${md>fields.settlementDate.slice(5)?year-1:year}-${md}`;if(validSalesDate(guess))deliveryDate=guess}
  fields.lines.push({slipNumber:slip?'TN-'+slip[1]:'',description:desc,deliveryDate,weightKg:numeric.length>=3?numeric.at(-3):'',unitPrice:numeric.length>=2?numeric.at(-2):'',amount:numeric.length>=1?Number(numeric.at(-1)).toFixed(2):''})
 }
 return fields
}
export const salesOcrScore=fields=>fields.lines.reduce((n,l)=>n+(l.weightKg&&l.unitPrice&&l.amount&&salesLineCents(l.weightKg,l.unitPrice)===Math.round(Number(l.amount)*100)?10:0)+(l.slipNumber?2:0),0)+(fields.billNumber?3:0)+(fields.settlementDate?3:0)
export async function recognizeSales(proof,masters){
 const parsed=image(proof);if(reading)return{status:'busy',fields:{}}
 let folder;reading=true
 const deadline=Date.now()+45000
 const execute=(program,args,maximum=8000)=>{const remaining=deadline-Date.now();if(remaining<500)throw Error('OCR deadline');return run(program,args,{timeout:Math.min(maximum,remaining),maxBuffer:1000000})}
 const convert=process.env.KCS_CONVERT_PATH||'convert',tesseract=process.env.KCS_TESSERACT_PATH||'tesseract'
 const convertArgs=['-limit','memory','128MiB','-limit','map','256MiB']
 const read=async file=>{const{stdout}=await execute(tesseract,[file,'stdout','-l','eng','--psm','6']);return parseSalesOcr(stdout,masters)}
 try{
  folder=await fs.mkdtemp(path.join(os.tmpdir(),'kcs-sales-'));const file=path.join(folder,'settlement.'+parsed.extension);await fs.writeFile(file,parsed.bytes,{mode:0o600})
  let rotation=0,oriented=file,fields=await read(file)
  // Deskew only corrects small angles. Sideways/upside-down documents need quarter turns first.
  if(salesOcrScore(fields)<10){
   for(const angle of [90,180,270]){
    if(deadline-Date.now()<12000)break
    const trial=path.join(folder,'turn-'+angle+'.png')
    try{await execute(convert,[...convertArgs,file,'-rotate',String(angle),trial]);const candidate=await read(trial)
     if(salesOcrScore(candidate)>salesOcrScore(fields)){fields=candidate;rotation=angle;oriented=trial}
     if(salesOcrScore(fields)>=10&&fields.lines.length)break
    }catch{/* try another direction while the request budget permits */}
   }
  }
  try{
   const enhanced=path.join(folder,'enhanced.png');await execute(convert,[...convertArgs,oriented,'-colorspace','Gray','-resize','2400x','-deskew','40%','-sharpen','0x1',enhanced]);const candidate=await read(enhanced)
   if(salesOcrScore(candidate)>salesOcrScore(fields))fields.lines=candidate.lines
   for(const k of ['settlementDate','billNumber','buyerId','vehicleId','total','factoryText'])if(!fields[k]&&candidate[k])fields[k]=candidate[k]
   const sum=fields.lines.reduce((n,l)=>n+Math.round(Number(l.amount||0)*100),0);if(sum>0&&Math.round(Number(candidate.total)*100)===sum&&Math.round(Number(fields.total)*100)!==sum)fields.total=candidate.total
  }catch{/* original orientation-corrected OCR remains available */}
  // Isolate the bill header: dot-matrix numbers need a separate single-line pass.
  if(!fields.billNumber){try{
   const header=path.join(folder,'bill-header.png')
   await execute(convert,[...convertArgs,oriented,'-resize','1280x','-gravity','NorthWest','-crop','440x150+800+235','+repage','-colorspace','Gray','-contrast-stretch','2%x2%','-resize','300%',header])
   const {stdout}=await execute(tesseract,[header,'stdout','-l','eng','--psm','6','tsv'])
   const words=stdout.split(/\r?\n/).slice(1).map(l=>l.split('\t')).filter(c=>c[0]==='5')
   const headerFields=parseSalesOcr(words.map(c=>c[11]).join(' '),masters)
   if(!fields.settlementDate&&headerFields.settlementDate)fields.settlementDate=headerFields.settlementDate
   const tokens=words.filter(c=>/^(?:CP|P)[-:]?\d/i.test(c[11]||''))
   if(tokens.length===1){
    const c=tokens[0],h=Number(c[9])/3,x=Math.max(0,Math.floor(800+Number(c[6])/3-3.3*h)),y=Math.max(0,Math.floor(235+Number(c[7])/3-.18*h))
    const w=Math.ceil(Number(c[8])/3+4.1*h),height=Math.round(h*1.75),line=path.join(folder,'bill-number.png')
    await execute(convert,[...convertArgs,oriented,'-resize','1280x','-gravity','NorthWest','-crop',`${w}x${height}+${x}+${y}`,'+repage','-colorspace','Gray','-contrast-stretch','2%x2%','-negate','-morphology','Close','Rectangle:1x2','-negate','-resize','300%',line])
    const result=await execute(tesseract,[line,'stdout','-l','eng','--psm','7','-c','tessedit_char_whitelist=CP0123456789-'])
    const number=parseSalesOcr(result.stdout,masters).billNumber
    // CP date-coded bills must agree with the independently read printed date.
    if(number&&fields.settlementDate&&number.startsWith('CP-'+fields.settlementDate.replaceAll('-','')))fields.billNumber=number
   }
  }catch{/* preserve the draft if the local header cannot be read */}}
  let previewDataUrl
  if(rotation){try{const preview=path.join(folder,'preview.jpg');await execute(convert,[...convertArgs,oriented,'-resize','1000x1000>','-quality','85',preview],3000);previewDataUrl='data:image/jpeg;base64,'+(await fs.readFile(preview)).toString('base64')}catch{}}
  return{status:fields.lines.length?'review':'unreadable',fields,rotation,previewDataUrl,factoryMatch:fields.buyerId?'matched':fields.factoryText?'unmatched':'unreadable'}
 }catch(e){return{status:e.code==='ENOENT'?'unavailable':'unreadable',fields:{}}}
 finally{reading=false;if(folder)await fs.rm(folder,{recursive:true,force:true})}
}
