import {useState} from 'react'
import {useI18n} from './i18n.jsx'
import RouteBranchEditor from './RouteBranchEditor.jsx'
import './ApprovalCustomerLink.css'

// Accept the public branch code only; database row IDs are not interchangeable.
export default function ApprovalCustomerLink({branchCode,children,disabled=false}){
 const {language}=useI18n(),[open,setOpen]=useState(false)
 const code=String(branchCode??'').trim()
 const label=({zh:'编辑客户／分店',en:'Edit customer / branch',ms:'Edit pelanggan / cawangan'})[language]||'Edit customer / branch'
 if(!code)return <span data-i18n-raw>{children}</span>
 return <><button type="button" className="approval-customer-link" title={label} disabled={disabled} onClick={event=>{event.stopPropagation();setOpen(true)}}><span data-i18n-raw>{children}</span></button>{open&&<RouteBranchEditor branchId={code} onClose={()=>setOpen(false)}/>}</>
}
