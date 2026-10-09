// Match stable codes, with display aliases for legacy/imported product records.
const groups=[['OCC'],['MIXED_PAPER','MIX PAPERS','MIX PAPER','MIXED PAPER'],['BLACK_WHITE_PAPER','B/W','BLACK & WHITE PAPER','BLACK AND WHITE'],['ALUMINUM_CAN','ALUMINIUM_CAN','AL/CAN'],['PET'],['G2'],['SALI_TIN','SALI/TIN','SALIL/TIN']]
const normalize=value=>String(value||'').trim().toUpperCase()
const rank=p=>{const names=[p.productCode,p.shortForm,p.fullName].map(normalize);const i=groups.findIndex(g=>g.some(v=>names.includes(v)));return i<0?groups.length:i}
export function orderPurchaseProducts(products=[]){return [...products].sort((a,b)=>rank(a)-rank(b)||String(a.shortForm||a.fullName||a.productCode||'').localeCompare(String(b.shortForm||b.fullName||b.productCode||''),'en',{numeric:true,sensitivity:'base'})||Number(a.productId)-Number(b.productId))}
