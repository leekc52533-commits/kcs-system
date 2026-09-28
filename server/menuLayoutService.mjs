import {defaultMenuLayout,validMenuLayout,normalizeMenuLayout,pageMenuIds} from '../shared/menuLayout.js'
const fail=(code,statusCode)=>Object.assign(Error(code),{code,statusCode})
export function readMenu(db,account){const row=db.prepare('SELECT * FROM company_menu WHERE id=1').get();return{layout:row?.layout_json?normalizeMenuLayout(JSON.parse(row.layout_json)):defaultMenuLayout(),revision:row?.revision||0,canEdit:Boolean(account?.id&&row?.owner_account_id===Number(account.id))}}
export function saveMenu(db,account,payload){
 db.exec('BEGIN IMMEDIATE');try{
 const current=readMenu(db,account)
 if(!current.canEdit)throw fail('MENU_OWNER_ONLY',403)
 if(!validMenuLayout(payload.layout))throw fail('MENU_INVALID',400)
 if(payload.revision!==current.revision)throw fail('MENU_STALE',409)
 const json=JSON.stringify(normalizeMenuLayout(payload.layout))
 db.prepare('UPDATE company_menu SET layout_json=?,revision=revision+1 WHERE id=1').run(json)
 db.prepare('INSERT INTO company_menu_audit(account_id,before_json,after_json) VALUES(?,?,?)').run(account.id,JSON.stringify(current.layout),json)
 const result=readMenu(db,account);db.exec('COMMIT');return result
 }catch(e){db.exec('ROLLBACK');throw e}
}

const defaultShortcuts=['operations','special','customers','vehicles','materials','staff']
export function readPersonalMenu(db,account){
 if(!account?.id)throw fail('MENU_OWNER_ONLY',403)
 const row=db.prepare('SELECT * FROM personal_menu WHERE account_id=?').get(account.id),company=readMenu(db,account)
 const saved=row?JSON.parse(row.config_json):{}
 return {layout:normalizeMenuLayout(saved.layout||company.layout),hidden:saved.hidden||[],shortcuts:saved.shortcuts||defaultShortcuts,revision:row?.revision||0,canEdit:true,companyCanEdit:company.canEdit,defaultLayout:company.layout}
}
export function savePersonalMenu(db,account,payload){
 if(!account?.id)throw fail('MENU_OWNER_ONLY',403)
 const ids=[...pageMenuIds,'special'],validList=v=>Array.isArray(v)&&v.length<=ids.length&&new Set(v).size===v.length&&v.every(x=>ids.includes(x))
 if(!payload||!validMenuLayout(payload.layout)||!validList(payload.hidden)||payload.hidden.includes('dashboard')||!validList(payload.shortcuts))throw fail('MENU_INVALID',400)
 db.exec('BEGIN IMMEDIATE')
 try{
  const current=readPersonalMenu(db,account)
  if(payload.revision!==current.revision)throw fail('MENU_STALE',409)
  const config=JSON.stringify({layout:normalizeMenuLayout(payload.layout),hidden:payload.hidden,shortcuts:payload.shortcuts})
  db.prepare('INSERT INTO personal_menu(account_id,config_json,revision) VALUES(?,?,1) ON CONFLICT(account_id) DO UPDATE SET config_json=excluded.config_json,revision=personal_menu.revision+1').run(account.id,config)
  const result=readPersonalMenu(db,account);db.exec('COMMIT');return result
 }catch(e){db.exec('ROLLBACK');throw e}
}
