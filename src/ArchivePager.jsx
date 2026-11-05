import {useI18n} from './i18n.jsx'
import './ArchivePager.css'
const words={en:{previous:'Previous page',next:'Next page',page:'Page',total:'Total'},ms:{previous:'Halaman sebelumnya',next:'Halaman seterusnya',page:'Halaman',total:'Jumlah'},zh:{previous:'上一页',next:'下一页',page:'页',total:'共'}}
export default function ArchivePager({page,count,size,onChange}){
 const {language}=useI18n(),w=words[language]||words.en,pages=Math.max(1,Math.ceil(count/size))
 if(count<=size)return null
 return <nav className="archive-pager" aria-label={w.page}>
  <button type="button" disabled={page===0} onClick={()=>onChange(page-1)}>{w.previous}</button>
  <span data-i18n-raw>{w.page} {page+1} / {pages} · {w.total} {count}</span>
  <button type="button" disabled={page>=pages-1} onClick={()=>onChange(page+1)}>{w.next}</button>
 </nav>
}
