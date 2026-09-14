import {translate,translateUi} from './translations.js'

let activeLanguage='en'
let previewEmployeeId=null
export function setPreviewEmployee(id){previewEmployeeId=id?Number(id):null}
export function isEmployeePreview(){return previewEmployeeId!==null}
export function previewReadPath(url){return previewEmployeeId?`/api/acting-collector/preview/${previewEmployeeId}/read?path=${encodeURIComponent(url)}`:url}


export function setApiLanguage(language){
  activeLanguage=['en','ms','zh'].includes(language)?language:'en'
}

export function apiErrorMessage(payload,fallbackKey='apiError.generic'){
  const code=payload?.errorCode||payload?.code
  if(code){
    const key=`apiError.${String(code).toLowerCase()}`
    const translated=translate(activeLanguage,key,payload)
    if(translated!==key)return translated
  }
  return translate(activeLanguage,fallbackKey)
}

export async function apiRequest(url,options={}){
  if(previewEmployeeId&&String(options.method||'GET').toUpperCase()!=='GET')throw Object.assign(new Error(translate(activeLanguage,'preview.readOnly')),{code:'PREVIEW_READ_ONLY'})
  const response=await fetch(previewReadPath(url),{headers:{'Content-Type':'application/json',...(options.headers||{})},...options})
  const data=await response.json().catch(()=>({}))
  if(!response.ok){
    const requestId=data.requestId||response.headers.get('X-Request-ID')||''
    const scheduleMessage=response.status===400&&/(?:\/collection-schedule|\/customer-workspace)$/.test(url)&&data.details?.scheduleValidationMessage
    const message=typeof scheduleMessage==='string'?translateUi(activeLanguage,scheduleMessage):apiErrorMessage(data)
    const error=new Error(requestId?`${message} (Reference: ${requestId})`:message)
    error.code=data.errorCode||data.code||'UNKNOWN_ERROR'
    error.status=response.status
    error.requestId=requestId
    error.details=data.details||null
    throw error
  }
  return data
}
