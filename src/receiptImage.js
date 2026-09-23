import {receiptTimestamp} from '../shared/customerReceipt.js'
import {formatWeight,formatUnitPrice} from '../shared/measurePrecision.js'
const money=n=>`RM ${(Number(n||0)/100).toFixed(2)}`
// Render bill snapshots only: no page chrome, payment photos or account details.
export async function receiptImage(bill){
 if(!bill?.billNumber||!Array.isArray(bill.items))throw new Error('Invalid receipt')
 if(document.fonts?.ready)await document.fonts.ready
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')
 if(!ctx)throw new Error('Image unavailable')
 const width=640,pad=32,lineHeight=34,lines=[]
 ctx.font='24px sans-serif'
 const add=(text,bold=false)=>{
  let line=''
  for(const c of String(text??'')){
   if(c==='\n'||ctx.measureText(line+c).width>width-pad*2){lines.push({text:line,bold});line=c==='\n'?'':c}else line+=c
  }
  lines.push({text:line,bold})
 }
 add('LEE SAI KER ENTERPRISE',true);add('PURCHASE',true);add('')
 if(bill.status==='voided')add('VOIDED — NOT VALID',true)
 add('No: '+bill.billNumber);add('Date: '+bill.serviceDate)
 add('To: '+bill.branchName);add('Att: '+(bill.registrationNumber||''))
 add('')
 for(const item of bill.items){add(`${/kg|kilogram/i.test(item.unit)?formatWeight(item.quantity):item.quantity} ${item.unit||''} · ${item.shortForm||item.productName||item.item||''}`);add(`RM ${formatUnitPrice(item.unitPrice??item.unitPriceCents/100)} / ${item.unit||'unit'}    ${money(item.lineTotalCents??item.itemTotalCents)}`);add('')}
 add('Total: '+money(bill.totalCents),true);add(bill.paymentMethod);if(bill.issuedAt)add(receiptTimestamp(bill.issuedAt))
 canvas.width=width;canvas.height=pad*2+lines.length*lineHeight
 ctx.fillStyle='#fff';ctx.fillRect(0,0,width,canvas.height);ctx.fillStyle='#111';ctx.textBaseline='top'
 lines.forEach((line,i)=>{ctx.font=`${line.bold?'bold ':''}24px sans-serif`;ctx.fillText(line.text,pad,pad+i*lineHeight)})
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Image unavailable')),'image/png'))
}
export async function shareReceiptFile(file,nav=navigator){
 if(!nav.share||!nav.canShare?.({files:[file]}))return 'unsupported'
 try{await nav.share({files:[file]});return 'shared'}catch(error){if(error.name==='AbortError')return 'cancelled';throw error}
}
