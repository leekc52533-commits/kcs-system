const text=value=>value==null?'':String(value).trim()
const date=value=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(text(value));return m?`${m[3]}-${m[2]}-${m[1].slice(-2)}`:text(value)}
const money=value=>`RM ${(Number(value||0)/100).toFixed(2)}`
const entered=value=>{const time=text(value).match(/T(\d{2}:\d{2})/)?.[1];return time?`${date(value)} ${time}`:date(value)}
export const archiveKeys={
 expense:['serviceDateLabel','expenseTypeLabel','employeeName','category','description','amountLabel','paymentMethod','referenceNumber','vehiclePlate','odometerKm','companyName','tinNumber','remarks','createdBy','createdAtLabel','receiptLabel'],
 purchase:['serviceDateLabel','billNumber','paymentMethod','customerName','branchName','issuedBy','crew','car','totalLabel','proofLabel','statusLabel']
}
export function archiveValue(kind,row,key,sort=false){
 if(!archiveKeys[kind]?.includes(key))return ''
 if(key==='serviceDateLabel')return sort?text(row.serviceDate):date(row.serviceDate)
 if(key==='createdAtLabel')return sort?text(row.createdAt):entered(row.createdAt)
 if(key==='amountLabel')return sort?Number(row.amountCents):money(row.amountCents)
 if(key==='totalLabel')return sort?Number(row.totalCents):money(row.totalCents)
 if(key==='odometerKm')return row.odometerKm==null?'':sort?Number(row.odometerKm):text(row.odometerKm)
 if(key==='expenseTypeLabel')return row.expenseType==='admin'?'Admin Expense':'Employee Expense'
 if(key==='receiptLabel')return row.hasProof?'Uploaded':'Missing'
 if(key==='proofLabel')return row.proofId?'Uploaded':row.paymentMethod==='Credit'?'Not required':'Missing'
 if(key==='statusLabel')return row.status==='voided'?'Voided':'Issued'
 if(key==='car')return text(row.registrationNumber||row.vehicleCode)
 return text(row[key])
}
export function applyArchiveColumns(kind,rows,query={}){
 let selected={}
 try{const parsed=typeof query.columns==='string'?JSON.parse(query.columns):query.columns;if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))selected=parsed}catch{}
 const keys=archiveKeys[kind],collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'})
 const filterOptions=Object.fromEntries(keys.map(key=>[key,[...new Set(['',...rows.map(row=>text(archiveValue(kind,row,key)))])].sort((a,b)=>collator.compare(a,b))]))
 const sets=keys.filter(key=>Array.isArray(selected[key])).map(key=>[key,new Set(selected[key].filter(v=>typeof v==='string'))])
 const items=rows.filter(row=>sets.every(([key,set])=>set.has(text(archiveValue(kind,row,key)))))
 if(keys.includes(query.sortKey)&&['asc','desc'].includes(query.sortDirection)){
  const sign=query.sortDirection==='desc'?-1:1,key=query.sortKey
  items.sort((a,b)=>{const x=archiveValue(kind,a,key,true),y=archiveValue(kind,b,key,true);return sign*(x===''?(y===''?0:-1):y===''?1:typeof x==='number'&&typeof y==='number'?x-y:collator.compare(String(x),String(y)))})
 }
 return{items,filterOptions}
}
