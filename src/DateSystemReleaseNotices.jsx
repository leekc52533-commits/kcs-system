import {useI18n} from './i18n.jsx'
import {dateSystemWords} from './dateSystemReviewWords.js'
export default function DateSystemReleaseNotices({items=[]}){
 const {language}=useI18n(),w=dateSystemWords[language]||dateSystemWords.en
 if(!items.length)return null
 return <section className="mobile-card date-system-release-notices">{items.map(item=><article key={item.id}><b data-i18n-raw>{item.branchId} — {item.branchName}</b><p>{w.released}</p><p>{item.systemStatus==='pending'?w.waiting:w.systemRejected}</p></article>)}</section>
}
