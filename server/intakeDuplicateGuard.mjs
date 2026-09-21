// Fail closed for a new-customer write when a current master already matches its name/code.
export function assertNewIntake(db,name){
 const term=String(name||'').trim();if(!term)return
 const q='%'+term.replace(/[\\%_]/g,'\\$&')+'%'
 const found=db.prepare(`SELECT b.id FROM branches b JOIN customers c ON c.id=b.customer_id WHERE b.is_active=1 AND b.status='active' AND b.lifecycle_status='ACTIVE' AND c.is_active=1 AND (b.branch_name LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR b.jodoo_branch_id=? OR c.jodoo_customer_id=? OR EXISTS(SELECT 1 FROM branches alias WHERE alias.replaced_by_branch_id=b.id AND (alias.branch_name LIKE ? ESCAPE '\\' OR alias.jodoo_branch_id=?))) LIMIT 1`).get(q,q,term,term,q,term)
 if(found)throw Object.assign(new Error('Select the existing customer from search results.'),{code:'PICKUP_EXISTING_REQUIRED',statusCode:409})
}
