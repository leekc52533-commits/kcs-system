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
