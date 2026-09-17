export default function RecordActionIcon({kind}) {
 return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
 {kind==='upload'?<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>:
 kind==='add'?<path d="M14 2H5v20h14V7zM14 2v5h5M8 14h8M12 10v8"/>:
 kind==='correction'?<path d="M12 3H4v18h16v-8M14 7l3 3M9 15l1-4 9-9 3 3-9 9zM7 18h7"/>:
 kind==='columns'?<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16M3 9h18"/></>:
 kind==='refresh-single'?<path d="M20 4v6h-6M20 10a8 8 0 1 0-1 8"/>:
 kind==='refresh'?<path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/>:
 <path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>}
 </svg>
}
