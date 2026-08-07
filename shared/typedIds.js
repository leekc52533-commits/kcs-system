const TYPES={customer:{prefix:'C',label:'Customer'},branch:{prefix:'B',label:'Branch'},buyer:{prefix:'BY',label:'Buyer'},buyerbranch:{prefix:'BB',label:'Buyer Branch'}}
const BUYER_ID_OFFSET=10000

export function parseTypedId(value,expectedType){
  const type=TYPES[String(expectedType||'').toLowerCase()]
  if(!type)throw new Error('Unknown ID type')
  const input=String(value??'').trim(),match=input.match(/^([A-Za-z]*)(\d+)$/)
  if(!match||match[1]&&match[1].toUpperCase()!==type.prefix)throw new Error(`${type.label} ID ${input||'(blank)'} is invalid`)
  if(['buyer','buyerbranch'].includes(String(expectedType).toLowerCase())){
    const number=Number(match[2])
    if(number<=BUYER_ID_OFFSET)throw new Error(`${type.label} ID ${input||'(blank)'} is invalid`)
    return String(number-BUYER_ID_OFFSET)
  }
  return match[2]
}

const format=(value,type)=>{if(value==null||String(value).trim()==='')return '';const input=String(value).trim(),prefix=TYPES[type].prefix;try{return `${prefix}${parseTypedId(input,type)}`}catch{ return input.toUpperCase().startsWith(prefix)?input:`${prefix}${input}` }}
export const formatCustomerId=value=>format(value,'customer')
export const formatBranchId=value=>format(value,'branch')
export const formatBuyerId=value=>{if(value==null||String(value).trim()==='')return '';const id=Number(value);return Number.isInteger(id)&&id>0?`BY${BUYER_ID_OFFSET+id}`:String(value)}
export const formatBuyerBranchId=value=>{if(value==null||String(value).trim()==='')return '';const input=String(value).trim();if(/^BB\d{5,}$/i.test(input))return input.toUpperCase();const number=Number(input);return Number.isInteger(number)&&number>0?`BB${number>BUYER_ID_OFFSET?number:BUYER_ID_OFFSET+number}`:input}
