import {createContext,useContext,useEffect,useRef,useState} from 'react'
import {useI18n} from './i18n.jsx'
import './BackgroundExports.css'

const Context=createContext(null)
export const useBackgroundExports=()=>useContext(Context)
const words={
 zh:{generating:'文件正在生成，可继续操作',downloading:'正在接收文件…',ready:'文件已准备好',failed:'导出失败',download:'下载',close:'关闭',busy:'已有文件正在生成，请完成后再导出。',keep:'请保持此 KCS 标签页打开；刷新或关闭会中断下载。'},
 en:{generating:'Preparing file. You can continue working.',downloading:'Receiving file…',ready:'File ready',failed:'Export failed',download:'Download',close:'Close',busy:'An export is already running. Please wait.',keep:'Keep this KCS tab open. Reloading or closing interrupts the download.'},
 ms:{generating:'Fail sedang disediakan. Anda boleh terus bekerja.',downloading:'Sedang menerima fail…',ready:'Fail sedia',failed:'Eksport gagal',download:'Muat turun',close:'Tutup',busy:'Eksport sedang berjalan. Sila tunggu.',keep:'Biarkan tab KCS ini terbuka. Muat semula atau tutup akan mengganggu muat turun.'}
}
function download(file){const a=document.createElement('a');a.href=file.href;a.download=file.fileName;document.body.appendChild(a);a.click();a.remove()}
export default function BackgroundExports({children}){
 const{language}=useI18n(),m=words[language]||words.en
 const[jobs,setJobs]=useState([]),files=useRef([]),running=useRef(false),alive=useRef(true),controller=useRef(null)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();files.current.forEach(file=>URL.revokeObjectURL(file.href));files.current=[]}},[])
 const update=(id,change)=>{if(alive.current)setJobs(old=>old.map(job=>job.id===id?{...job,...change}:job))}
 const start=(title,range,operation)=>{
  if(running.current)return false
  running.current=true;const id=crypto.randomUUID(),abort=new AbortController();controller.current=abort
  setJobs(old=>[...old,{id,title,range,status:'generating'}])
  const options={...range}
  Object.defineProperties(options,{background:{value:true},signal:{value:abort.signal},onProgress:{value:status=>update(id,{status})}})
  // Defer work until the dialog has closed and the page can repaint.
  setTimeout(async()=>{
   try{
    if(abort.signal.aborted)return
    const result=await operation(options)
    if(!alive.current||abort.signal.aborted)return
    let file
    if(result?.blob){
     file={href:URL.createObjectURL(result.blob),fileName:result.fileName,id};files.current.push(file)
     if(files.current.length>3){const expired=files.current.shift();URL.revokeObjectURL(expired.href);setJobs(old=>old.filter(job=>job.id!==expired.id))}
     try{download(file)}catch{/* The persistent manual Download link remains available. */}
    }
    update(id,{status:'ready',file})
   }catch(error){if(!abort.signal.aborted)update(id,{status:'failed',error:error.message})}
   finally{running.current=false}
  },0)
  return true
 }
 const dismiss=id=>{const file=files.current.find(file=>file.id===id);if(file)URL.revokeObjectURL(file.href);files.current=files.current.filter(file=>file.id!==id);setJobs(old=>old.filter(job=>job.id!==id))}
 return <Context.Provider value={{start,busyMessage:m.busy}}>{children}<aside className="kcs-background-exports" aria-live="polite">{jobs.map(job=><section key={job.id} role={job.status==='failed'?'alert':'status'}><strong>{job.title}</strong><p>{m[job.status]}</p>{['generating','downloading'].includes(job.status)&&<small>{m.keep}</small>}{job.error&&<p>{job.error}</p>}{job.file&&<a href={job.file.href} download={job.file.fileName}>{m.download} · {job.file.fileName}</a>}{['ready','failed'].includes(job.status)&&<button type="button" onClick={()=>dismiss(job.id)}>{m.close}</button>}</section>)}</aside></Context.Provider>
}
