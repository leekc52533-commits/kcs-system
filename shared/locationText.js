const CJK=/[\u3400-\u9fff]/

export const containsCjk=value=>CJK.test(String(value??''))

export function assertLocationText(value,field='Location'){
  if(value!=null&&containsCjk(value)){
    const error=new Error(`${field} location text contains CJK characters`)
    error.code='INVALID_LOCATION_TEXT'
    throw error
  }
  return value
}

export function assertLocationFields(payload,fields){
  for(const field of fields)if(Object.hasOwn(payload,field))assertLocationText(payload[field],field)
}
