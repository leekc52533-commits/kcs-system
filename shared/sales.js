export const salesColumns=['settlementDate','deliveryDate','billNumber','buyerName','vehiclePlate','slipNumber','description','weightKg','unitPrice','amount','total','remarks','createdBy']
export const billKey=value=>String(value||'').trim().toUpperCase().replace(/\s+/g,'')
export const validSalesDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value))&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value
// Quantities/prices are stored to three/six decimals; final amounts are integer cents.
export const salesLineCents=(kg,price)=>Math.round((Number(kg)*Number(price)+Number.EPSILON)*100)
export function filterSales(rows,query={}){
 const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'}),str=v=>String(v??'').trim()
 let columns={};try{columns=typeof query.columns==='string'?JSON.parse(query.columns):query.columns||{}}catch{}
 const options=Object.fromEntries(salesColumns.map(k=>[k,[...new Set(['',...rows.map(r=>str(r[k]))])].sort(collator.compare)]))
 const items=rows.filter(r=>salesColumns.every(k=>!Array.isArray(columns?.[k])||columns[k].includes(str(r[k]))))
 if(salesColumns.includes(query.sortKey)&&['asc','desc'].includes(query.sortDirection)){const k=query.sortKey,sign=query.sortDirection==='asc'?1:-1;items.sort((a,b)=>sign*(['weightKg','unitPrice','amount','total'].includes(k)?Number(a[k])-Number(b[k]):collator.compare(str(a[k]),str(b[k]))))}
 return{items,filterOptions:options}
}

// Re-read machine-filled values, while retaining edits made by the reviewer.
export function mergeSalesRecognition(form,fields={},previous={}){
 const next={...form,reviewed:false}
 for(const key of ['buyerId','vehicleId','billNumber','settlementDate','total']){
  if(!next[key]||Object.hasOwn(previous,key)&&String(next[key])===String(previous[key]))next[key]=fields[key]||''
 }
 const empty=form.lines.length===1&&Object.values(form.lines[0]).every(v=>!v)
 if((empty||previous.lines&&JSON.stringify(form.lines)===JSON.stringify(previous.lines))&&fields.lines?.length)next.lines=fields.lines
 return next
}
