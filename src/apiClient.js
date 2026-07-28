import {translate} from './translations.js'

let activeLanguage='en'

export function setApiLanguage(language){
  activeLanguage=['en','ms','zh'].includes(language)?language:'en'
}

export function apiErrorMessage(payload,fallbackKey='apiError.generic'){
  const code=payload?.errorCode||payload?.code
  if(code){
    const key=`apiError.${String(code).toLowerCase()}`
    const translated=translate(activeLanguage,key)
    if(translated!==key)return translated
  }
  return translate(activeLanguage,fallbackKey)
}

export async function apiRequest(url,options={}){
  const response=await fetch(url,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options})
  const data=await response.json().catch(()=>({}))
  if(!response.ok){
    const error=new Error(apiErrorMessage(data))
    error.code=data.errorCode||data.code||'UNKNOWN_ERROR'
    error.status=response.status
    throw error
  }
  return data
}
