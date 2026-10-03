// Use the pinned account identity, never a client flag, display name or owner role.
export function canDirectApproveDate(db,account){
 if(!Number(account?.id))return false
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='company_menu'").get())return false
 return Number(db.prepare('SELECT owner_account_id FROM company_menu WHERE id=1').get()?.owner_account_id)===Number(account.id)
}
export function isDirectDateApproval(db,payload,account){
 return payload?.ownerDirectApproval===true&&canDirectApproveDate(db,account)
}
