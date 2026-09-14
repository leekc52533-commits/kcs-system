export function receiptTimestamp(value){
 const raw=String(value??'').trim()
 if(!raw)return ''
 if(!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw))return raw.replace('T',' ')
 const date=new Date(raw);if(Number.isNaN(date.getTime()))return raw
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kuching',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]))
 return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const amount=cents=>(Number(cents||0)/100).toFixed(2)
// Only the original bill/item snapshots from the archive are rendered.
export function customerReceiptHtml(bill){
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(bill.billNumber)}</title><style>body{margin:0;padding:16px;color:#111;background:white;font:14px monospace}.receipt{max-width:76mm;margin:auto}h1{font-size:18px;text-align:center}h2{text-align:center;font-size:16px}table{width:100%;border-collapse:collapse}td{padding:7px 2px;vertical-align:top}td:last-child{text-align:right;white-space:nowrap}hr{border:0;border-top:1px dashed #555}.void{border:2px solid #a22;color:#a22;text-align:center;font-weight:bold;padding:8px}@media print{@page{margin:6mm}body{padding:0}}</style></head><body><main class="receipt"><h1>LEE SAI KER ENTERPRISE</h1><h2>PURCHASE</h2>${bill.status==='voided'?'<p class="void">VOIDED — NOT VALID</p>':''}<hr><p>No: ${escape(bill.billNumber)}<br>Date: ${escape(bill.serviceDate)}<br>To: ${escape(bill.branchName)}<br>Att: ${escape(bill.registrationNumber)}<br>Issued by: ${escape(bill.issuedBy)}</p><hr><table><tbody>${bill.items.map(i=>`<tr><td>${escape(i.quantity)} ${escape(i.unit)} · ${escape(i.shortForm||i.item)}<br>@ RM ${amount(i.unitPriceCents)}</td><td>RM ${amount(i.itemTotalCents)}</td></tr>`).join('')}</tbody></table><hr><p><b>Total: RM ${amount(bill.totalCents)}</b></p><p>${escape(bill.paymentMethod)}</p><small>${escape(receiptTimestamp(bill.issuedAt))}</small></main></body></html>`
}
