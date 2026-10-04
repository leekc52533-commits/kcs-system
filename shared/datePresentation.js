export const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
export function displayDateParts(y,m,d){const month=months[Number(m)-1];return month?`${String(d).padStart(2,'0')}-${month}-${String(y).slice(-2)}`:`${y}-${m}-${d}`}
export function formatDateDisplay(value){
 if(typeof value!=='string')return value
 return value.replace(/(\d{4})年(\d{1,2})月(\d{1,2})日/g,(_,y,m,d)=>displayDateParts(y,m,d)).replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g,(_,d,m,y)=>displayDateParts(y,m,d)).replace(/(^|[\s(（→～~])([0-9]{4})-(\d{2})-(\d{2})(?=$|[T\s)）→～~,])/g,(_,p,y,m,d)=>p+displayDateParts(y,m,d)).replace(/(\d{2}-[A-Z][a-z]{2}-\d{2})T(?=\d{2}:)/g,'$1 ')
}
