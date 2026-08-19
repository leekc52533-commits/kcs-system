export default function FormActionBar({children,sticky=true,className=''}){
  const classes=['form-action-bar',sticky&&'form-action-bar--sticky',className].filter(Boolean).join(' ')
  return <footer className={classes}>{children}</footer>
}
