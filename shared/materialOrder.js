const compact=value=>String(value??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'')

export function materialOrder(value){
  const name=compact(typeof value==='object'?(value.materialCode||value.materialName):value)
  if(name==='occ'||name.includes('oldcorrugated'))return 1
  if(['mixpaper','mixedpaper','bristolpaper','bristol'].includes(name))return 2
  if(name==='iron'||name.includes('ferrous'))return 3
  if(['aluminiumcan','aluminumcan','aluminium','aluminum'].includes(name))return 4
  if(name==='plastic'||name.includes('plastic'))return 5
  if(['ewaste','electronicwaste'].includes(name))return 6
  return 100
}

export function compareMaterials(left,right){
  const order=materialOrder(left)-materialOrder(right)
  if(order)return order
  const leftName=String(left?.materialName??left?.materialCode??left??'')
  const rightName=String(right?.materialName??right?.materialCode??right??'')
  return leftName.localeCompare(rightName,'en',{sensitivity:'base',numeric:true})
}

export function sortMaterials(items){
  return [...(items||[])].sort(compareMaterials)
}
