// Imported schedule fields are calendar dates, even when legacy exports append a time.
// Preserve the stated calendar date; never guess ambiguous slash formats or roll invalid days.
export function planningDate(value){
 if(typeof value!=='string')return null
 const text=value.trim(),match=/^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(text)
 if(!match)return null
 const day=match[1],date=new Date(`${day}T00:00:00Z`)
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==day)return null
 if(text!==day&&!Number.isFinite(Date.parse(text)))return null
 return day
}
