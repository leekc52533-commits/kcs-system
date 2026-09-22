export const dateEvidenceMode=code=>['little','closed','full','bay'].includes(code)?'onsite':['customer','call','stopped'].includes(code)?'contact':['bill','other'].includes(code)?'photo':code==='collected'?'record':['time','staff'].includes(code)?'operations':null
export function evidenceProblem(code,e={}){
 const mode=dateEvidenceMode(code),text=v=>String(v||'').trim()
 if(!mode)return 'reason'
 if(code==='other')if(!text(e.details))return 'details'
 if(mode==='contact'){
  if(!['message','phone','onsite'].includes(e.contactMethod))return 'contact'
  if(!text(e.contactName)||!e.contactAt||!Number.isFinite(Date.parse(e.contactAt)))return 'contact'
 }
 if(mode==='record'&&!text(e.billNumber))return 'record'
 const photo=mode==='onsite'||mode==='photo'||mode==='contact'&&e.contactMethod==='message'
 if(photo&&!e.photo)return 'photo'
 if(mode==='onsite'){
  if(!['camera','system_camera'].includes(e.captureSource)||!e.capturedAt)return 'capture'
  if(!e.position||!Number.isFinite(e.position.latitude)||!Number.isFinite(e.position.longitude)||Math.abs(e.position.latitude)>90||Math.abs(e.position.longitude)>180||!Number.isFinite(e.position.accuracyM)||e.position.accuracyM<0)return 'gps'
 }
 return null
}
