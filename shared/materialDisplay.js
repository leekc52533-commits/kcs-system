export function materialDisplayName(item,{compact=false}={}){
  const full=String(item?.fullName??item?.materialName??'').trim()
  const short=String(item?.shortForm??'').trim()
  if(compact)return short||full
  return short&&short!==full?`${full} (${short})`:full
}
