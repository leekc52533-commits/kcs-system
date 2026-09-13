export const billMenuIds=['purchase-bills','sales','expense-records','bill-voids']
export const topMenuIds=['dashboard','notices','operations','acting-collector','documents','cash-float','customers','buyers','location-zone','vehicles','materials','staff']
export const defaultMenuLayout=()=>({top:[...topMenuIds],documents:[...billMenuIds]})
export function validMenuLayout(value){return value&&[['top',topMenuIds],['documents',billMenuIds]].every(([key,ids])=>Array.isArray(value[key])&&value[key].length===ids.length&&new Set(value[key]).size===ids.length&&value[key].every(id=>ids.includes(id)))}

export function normalizeMenuLayout(layout){if(!layout)return defaultMenuLayout();const top=[...new Set((layout.top||[]).filter(id=>topMenuIds.includes(id)))],documents=[...new Set((layout.documents||[]).filter(id=>billMenuIds.includes(id)))];if(!top.includes('notices'))top.splice(Math.max(0,top.indexOf('dashboard')+1),0,'notices');for(const id of topMenuIds)if(!top.includes(id))top.push(id);for(const id of billMenuIds)if(!documents.includes(id))documents.push(id);return{top,documents}}
