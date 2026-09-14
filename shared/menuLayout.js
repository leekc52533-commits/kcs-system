export const billMenuIds=['purchase-bills','sales','expense-records','bill-voids','unloading-records']
export const topMenuIds=['dashboard','notices','operations','acting-collector','documents','cash-float','customers','buyers','location-zone','vehicles','materials','staff']
export const pageMenuIds=[...topMenuIds.filter(id=>id!=='documents'),...billMenuIds]
export const defaultMenuLayout=()=>({top:[...topMenuIds],documents:[...billMenuIds]})
export const menuGroups=layout=>[{id:'documents',name:layout.documentName||'',items:layout.documents},...(layout.folders||[])]
const goodName=name=>typeof name==='string'&&name.trim().length>0&&name.length<=60
export function validMenuLayout(value){
 if(!value||!Array.isArray(value.top)||!Array.isArray(value.documents))return false
 const folders=value.folders||[];if(!Array.isArray(folders)||folders.length>30)return false
 if(value.documentName!==undefined&&!goodName(value.documentName))return false
 if(folders.some(f=>!f||!/^folder-[a-z0-9-]{1,64}$/.test(f.id)||!goodName(f.name)||!Array.isArray(f.items)))return false
 const groupIds=['documents',...folders.map(f=>f.id)]
 if(new Set(groupIds).size!==groupIds.length)return false
 if(value.top.some(id=>!pageMenuIds.includes(id)&&!groupIds.includes(id)))return false
 if(groupIds.some(id=>value.top.filter(x=>x===id).length!==1))return false
 const pages=[...value.top.filter(id=>!groupIds.includes(id)),...value.documents,...folders.flatMap(f=>f.items)]
 return pages.length===pageMenuIds.length&&new Set(pages).size===pages.length&&pages.every(id=>pageMenuIds.includes(id))
}
export function normalizeMenuLayout(layout){
 if(!layout)return defaultMenuLayout()
 const folders=Array.isArray(layout.folders)?layout.folders.filter(f=>f&&/^folder-[a-z0-9-]{1,64}$/.test(f.id)&&goodName(f.name)&&Array.isArray(f.items)).slice(0,30).filter((f,i,a)=>a.findIndex(x=>x.id===f.id)===i):[]
 const groupIds=['documents',...folders.map(f=>f.id)],seen=new Set()
 const take=list=>(Array.isArray(list)?list:[]).filter(id=>pageMenuIds.includes(id)&&!seen.has(id)&&(seen.add(id),true))
 const top=[]
 for(const id of layout.top||[])if(groupIds.includes(id)){if(!top.includes(id))top.push(id)}else if(pageMenuIds.includes(id)&&!seen.has(id)){seen.add(id);top.push(id)}
 const documents=take(layout.documents),nextFolders=folders.map(f=>({id:f.id,name:f.name,items:take(f.items)}))
 for(const id of groupIds)if(!top.includes(id))top.push(id)
 for(const id of pageMenuIds)if(!seen.has(id)){if(id==='notices')top.splice(Math.max(0,top.indexOf('dashboard')+1),0,id);else if(billMenuIds.includes(id))documents.push(id);else top.push(id)}
 return {top,documents,...(goodName(layout.documentName)?{documentName:layout.documentName}:{}),...(nextFolders.length?{folders:nextFolders}:{})}
}
