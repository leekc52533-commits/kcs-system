import {apiRequest} from './apiClient.js'
export async function allExportItems(url,request=apiRequest){
 const separator=url.includes('?')?'&':'?',first=await request(url+separator+'page=1&pageSize=500'),items=[...(first.items||[])];
 const pages=Number(first.pagination?.pages||1);
 for(let page=2;page<=pages;page++){const next=await request(url+separator+'page='+page+'&pageSize=500');items.push(...(next.items||[]))}
 return {...first,items};
}
export function exportRows(items,columns){
 const keys=columns.map((c,i)=>({key:c.key||String(i),label:c.label||c.key||String(i),value:c.value}));
 const used=new Set();for(const c of keys){let label=c.label,n=2;while(used.has(label))label=c.label+' ('+(n++)+')';c.label=label;used.add(label)}
 return {columns:keys.map(c=>c.label),rows:items.map(row=>Object.fromEntries(keys.map(c=>{const v=c.value?c.value(row):row[c.key];return[c.label,v==null?'':Array.isArray(v)?v.join(' / '):typeof v==='object'?JSON.stringify(v):v]})))};
}
