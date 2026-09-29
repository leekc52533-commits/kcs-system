import {kuchingDate} from './kuchingTime.js'
export function upcomingLeave(items,now=new Date()){
 const today=kuchingDate(now),end=new Date(today+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+7)
 const until=end.toISOString().slice(0,10)
 return items.filter(r=>['pending','approved'].includes(r.status)&&r.end_date>=today&&r.start_date<=until).sort((a,b)=>a.start_date.localeCompare(b.start_date)||a.name.localeCompare(b.name))
}

export function leaveDaysUntil(startDate,now=new Date()){return Math.round((Date.parse(startDate+'T00:00:00Z')-Date.parse(kuchingDate(now)+'T00:00:00Z'))/86400000)}
