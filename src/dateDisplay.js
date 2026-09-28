// Presentation only: stored values and API payloads remain ISO dates.
export function formatDateDisplay(value){
 if(typeof value!=='string')return value
 return value.replace(/(\d{4})年(\d{1,2})月(\d{1,2})日/g,(_,y,m,d)=>`${d.padStart(2,'0')}/${m.padStart(2,'0')}/${y}`).replace(/(^|\s)(\d{1,2})\/(\d{1,2})\/(\d{4})(?=$|[\s,])/g,(_,p,d,m,y)=>`${p}${d.padStart(2,'0')}/${m.padStart(2,'0')}/${y}`).replace(/(^|[\s(（→～~])([0-9]{4})-(\d{2})-(\d{2})(?=$|[T\s)）→～~])/g,(_,prefix,y,m,d)=>`${prefix}${d}/${m}/${y}`).replace(/(\d{2}\/\d{2}\/\d{4})T(?=\d{2}:)/g,'$1 ')
}
export function dateInputDisplay(value){return formatDateDisplay(String(value||''))}
export function parseDateInput(value,type='date'){
 const match=/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value)
 if(!match||type==='date'&&match[4]||type==='datetime-local'&&!match[4])return null
 const [,d,m,y,h,minute,second]=match,iso=`${y}-${m}-${d}`,date=new Date(iso+'T00:00:00Z')
 if(Number.isNaN(+date)||date.toISOString().slice(0,10)!==iso||Number(h)>23||Number(minute)>59||Number(second)>59)return null
 return iso+(h?`T${h}:${minute}${second?':'+second:''}`:'')
}
