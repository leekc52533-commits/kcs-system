import {useEffect,useRef,useState} from 'react'
import {useI18n} from './i18n.jsx'
export const photoWords={zh:{add:'添加照片（最多5张）',open:'放大照片',close:'关闭',remove:'移除照片'},en:{add:'Add photos (up to 5)',open:'Enlarge photo',close:'Close',remove:'Remove photo'},ms:{add:'Tambah foto (maksimum 5)',open:'Besarkan foto',close:'Tutup',remove:'Buang foto'}}
function EnlargedPhoto({photo,onClose,words}){
 const ref=useRef(null)
 useEffect(()=>{const d=ref.current;d.showModal();return()=>d.close()},[])
 return <dialog ref={ref} className="notice-photo-dialog" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose()}}><button type="button" data-preview-safe onClick={onClose}>{words.close}</button><img src={photo.url||photo.dataUrl} alt={photo.name||words.open}/></dialog>
}
export default function NoticePhotos({photos=[],onRemove,disabled=false}){
 const{language}=useI18n(),words=photoWords[language]||photoWords.en,[selected,setSelected]=useState(null)
 return <div className="notice-photos">{photos.map((photo,index)=><div key={index}><button type="button" data-preview-safe aria-label={`${words.open} ${index+1}`} onClick={()=>setSelected(photo)}><img loading="lazy" src={photo.url||photo.dataUrl} alt={photo.name||`${words.open} ${index+1}`}/></button>{onRemove&&<button type="button" disabled={disabled} onClick={()=>onRemove(index)}>{words.remove}</button>}</div>)}{selected&&<EnlargedPhoto photo={selected} words={words} onClose={()=>setSelected(null)}/>}</div>
}
