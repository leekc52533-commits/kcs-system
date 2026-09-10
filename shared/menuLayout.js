export const billMenuIds=['purchase-bills','sales','expense-records','bill-voids']
export const topMenuIds=['dashboard','operations','acting-collector','documents','cash-float','customers','buyers','location-zone','vehicles','materials','staff']
export const defaultMenuLayout=()=>({top:[...topMenuIds],documents:[...billMenuIds]})
export function validMenuLayout(value){return value&&[['top',topMenuIds],['documents',billMenuIds]].every(([key,ids])=>Array.isArray(value[key])&&value[key].length===ids.length&&new Set(value[key]).size===ids.length&&value[key].every(id=>ids.includes(id)))}
