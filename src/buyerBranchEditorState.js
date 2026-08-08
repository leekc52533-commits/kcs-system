const editableKeys=['branchName','address','latitude','longitude','contactPerson','phone','businessHours','acceptedMaterials','unloadingRestrictions','priceNotes','operationalNotes','status']

export function buildBuyerBranchPatch(form={}){
  const payload=Object.fromEntries(editableKeys.map(key=>[key,form[key]]))
  payload.canEnd=String(form.canEnd)!=='false'
  payload.reason=form.reason||'Buyer Branch update'
  return payload
}
