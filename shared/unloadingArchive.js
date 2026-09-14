export const unloadingColumns=['date','time','code','vehicle','driverName','crew','tripNumber','locationName','confirmedWeightKg','status','correctedCount']
export const unloadingLabels={
 en:['Date','Time','Unloading No.','Vehicle','Driver','Crew','Trip','Factory / Location','Weight (kg)','Status','Corrections'],
 ms:['Tarikh','Masa','No. pemunggahan','Kenderaan','Pemandu','Kelindan','Perjalanan','Kilang / Lokasi','Berat (kg)','Status','Pembetulan'],
 zh:['卸货日期','时间','卸货编号','车牌','司机','跟车员','趟次','工厂 / 地点','重量（kg）','状态','修改次数']
}
export const unloadingStatus={en:{confirmed:'Confirmed',pending_confirmation:'Pending confirmation'},ms:{confirmed:'Disahkan',pending_confirmation:'Menunggu pengesahan'},zh:{confirmed:'已确认',pending_confirmation:'待确认'}}
export function filterUnloading(rows,query={}){
 const str=v=>String(v??''),compare=new Intl.Collator('en',{numeric:true,sensitivity:'base'}).compare
 let columns={};try{columns=typeof query.columns==='string'?JSON.parse(query.columns):query.columns||{}}catch{}
 const filterOptions=Object.fromEntries(unloadingColumns.map(k=>[k,[...new Set(['',...rows.map(r=>str(r[k]))])].sort(compare)]))
 const items=rows.filter(r=>unloadingColumns.every(k=>!Array.isArray(columns?.[k])||columns[k].includes(str(r[k]))))
 if(unloadingColumns.includes(query.sortKey)&&['asc','desc'].includes(query.sortDirection)){
  const k=query.sortKey,sign=query.sortDirection==='asc'?1:-1
  items.sort((a,b)=>sign*(['tripNumber','confirmedWeightKg','correctedCount'].includes(k)&&a[k]!=null&&b[k]!=null?Number(a[k])-Number(b[k]):compare(str(a[k]),str(b[k]))))
 }
 return {items,filterOptions}
}

export function unloadingOrder(raw){let x=raw;try{if(typeof x==='string')x=JSON.parse(x)}catch{x=[]}return [...new Set([...(Array.isArray(x)?x.filter(k=>unloadingColumns.includes(k)):[]),...unloadingColumns])]}
