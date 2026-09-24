import {useEffect,useState} from 'react'
import {createPortal} from 'react-dom'
import {useI18n,useUi} from './i18n.jsx'
import {downloadSpreadsheet} from './spreadsheetFiles.js'
import {exportRows} from './dataExport.js'
import './DataExportButton.css'
export default function DataExportButton({rows=[],columns=[],name='KCS',getData,disabled=false,inline=false}){
 const{language}=useI18n(),ui=useUi(),[target,setTarget]=useState(null),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!inline)setTarget(document.getElementById('page-data-exports'))},[inline]);
 const label=language==='zh'?'导出':language==='ms'?'Eksport':'Export';
 const run=async()=>{if(busy)return;setBusy(true);try{const data=getData?await getData():exportRows(rows,columns.map(c=>({...c,label:ui(String(c.label||c.key).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ').replace(/\b\w/g,x=>x.toUpperCase()))})));await downloadSpreadsheet({...data,fileName:name.replace(/[\\/:*?"<>|]/g,'_'),label:name.replace(/[\\\\/:*?\[\]]/g,' ').slice(0,31)||'KCS'},'xlsx')}catch(e){window.alert(e.message||label)}finally{setBusy(false)}};
 const button=<button type="button" className="page-data-export" disabled={disabled||busy} onClick={run} title={label+' · '+name} aria-label={label+' · '+name}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 15V3m-5 5 5-5 5 5M4 15v6h16v-6"/></svg></button>;
 return target?createPortal(button,target):button;
}
