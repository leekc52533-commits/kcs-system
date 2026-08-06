const TYPES={customer:{prefix:'C',label:'Customer'},branch:{prefix:'B',label:'Branch'}}

export function parseTypedId(value,expectedType){
  const type=TYPES[String(expectedType||'').toLowerCase()]
  if(!type)throw new Error('Unknown ID type')
  const input=String(value??'').trim(),match=input.match(/^([A-Za-z]?)(\d+)$/)
  if(!match||match[1]&&match[1].toUpperCase()!==type.prefix)throw new Error(`${type.label} ID ${input||'(blank)'} is invalid`)
  return match[2]
}

const format=(value,type)=>{if(value==null||String(value).trim()==='')return '';const input=String(value).trim(),prefix=TYPES[type].prefix;try{return `${prefix}${parseTypedId(input,type)}`}catch{ return input.toUpperCase().startsWith(prefix)?input:`${prefix}${input}` }}
export const formatCustomerId=value=>format(value,'customer')
export const formatBranchId=value=>format(value,'branch')
