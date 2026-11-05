// Explicit opt-in: form fields advance, action buttons retain native Enter activation.
export function focusNextField(input){
 const form=input.closest('[data-enter-next],[data-export-date-range]')
 if(!form)return
 const fields=[...form.querySelectorAll('input,select,textarea,button')].filter(el=>
  !el.closest('[hidden],[aria-hidden="true"],.kcs-date-picker')&&el.type!=='hidden'&&
  (el.tagName!=='BUTTON'||el.type==='submit')&&el.tabIndex!==-1)
 const next=fields[fields.indexOf(input)+1]
 if(!next||next.matches(':disabled'))return
 next.focus()
 if(next.tagName==='INPUT'&&!['checkbox','radio'].includes(next.type)){try{next.select()}catch{}}
}
export function enterNextField(event){
 if(event.key!=='Enter'||event.defaultPrevented||event.isComposing||event.nativeEvent?.isComposing||event.keyCode===229||event.shiftKey||event.ctrlKey||event.altKey||event.metaKey)return
 const input=event.target
 if(event.repeat&&input.matches('button')){event.preventDefault();return}
 if(!input.matches('input,select,textarea')||input.closest('.kcs-date-picker'))return
 event.preventDefault()
 if(event.repeat)return
 if(input.validity&&!input.validity.valid){input.reportValidity();return}
 focusNextField(input)
}
