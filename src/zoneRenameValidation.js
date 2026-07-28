import {containsCjk} from '../shared/locationText.js'

export function validateZoneRename(value,t){
  const name=String(value||'').trim()
  if(!name)return t('zone.renameEmpty')
  if(containsCjk(name))return t('apiError.invalid_location_text')
  return ''
}
