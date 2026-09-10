import {defaultMenuLayout,validMenuLayout} from '../shared/menuLayout.js'
const fail=(code,statusCode)=>Object.assign(Error(code),{code,statusCode})
export function readMenu(db,account){const row=db.prepare('SELECT * FROM company_menu WHERE id=1').get();return{layout:row?.layout_json?JSON.parse(row.layout_json):defaultMenuLayout(),revision:row?.revision||0,canEdit:Boolean(account?.id&&row?.owner_account_id===Number(account.id))}}
export function saveMenu(db,account,payload){
 db.exec('BEGIN IMMEDIATE');try{
 const current=readMenu(db,account)
 if(!current.canEdit)throw fail('MENU_OWNER_ONLY',403)
 if(!validMenuLayout(payload.layout))throw fail('MENU_INVALID',400)
 if(payload.revision!==current.revision)throw fail('MENU_STALE',409)
 const json=JSON.stringify({top:payload.layout.top,documents:payload.layout.documents})
 db.prepare('UPDATE company_menu SET layout_json=?,revision=revision+1 WHERE id=1').run(json)
 db.prepare('INSERT INTO company_menu_audit(account_id,before_json,after_json) VALUES(?,?,?)').run(account.id,JSON.stringify(current.layout),json)
 const result=readMenu(db,account);db.exec('COMMIT');return result
 }catch(e){db.exec('ROLLBACK');throw e}
}
