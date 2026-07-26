export const isBlank=value=>value==null||String(value).trim()===''

export function requiredMessage(value,t){
  return isBlank(value)?t('validation.required'):''
}

export function passwordMessage(value,t,{minimum=8}={}){
  if(isBlank(value))return t('validation.required')
  return String(value).length<minimum?t('validation.passwordMin',{minimum}):''
}

export function fieldAccessibility(id,message){
  return {
    'aria-invalid':Boolean(message),
    'aria-describedby':message?id:undefined,
    'aria-required':'true'
  }
}

export function clearFieldError(setErrors,field){
  setErrors(current=>{
    if(!current[field])return current
    const next={...current}
    delete next[field]
    return next
  })
}
