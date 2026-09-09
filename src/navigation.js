let dirty=false

export const setNavigationDirty=value=>{dirty=Boolean(value)}
export const hasUnsavedNavigation=()=>dirty
export const confirmNavigation=(message,confirmFn=window.confirm)=>!dirty||confirmFn(message)

export function backOrFallback(fallback,message){
  if(!confirmNavigation(message))return false
  dirty=false
  if(window.history.state?.kcsPage&&window.history.length>1)window.history.back()
  else fallback()
  return true
}

// In-app links must remain usable when a fresh supervisor entry starts at Overview.
export function navigateWithinApp(url,message){
  if(!confirmNavigation(message))return false
  const target=new URL(url,window.location.href)
  if(target.origin!==window.location.origin)return false
  dirty=false
  window.history.pushState({kcsPage:target.searchParams.get('page')||'dashboard'},'',target)
  window.dispatchEvent(new PopStateEvent('popstate',{state:window.history.state}))
  return true
}
