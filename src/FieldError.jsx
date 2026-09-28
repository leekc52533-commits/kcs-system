import CenteredNotice from './CenteredNotice.jsx'
export default function FieldError({id,message}){
  if(!message)return null
  return <CenteredNotice>{message}</CenteredNotice>
}
