export const V25_VERSION=25

const expectedOrder=[['OCC','OCC',10],['PAPER','Paper',20],['ALUMINIUM','Aluminium',30],['SCRAP_IRON','Scrap Iron',40],['UNCATEGORIZED','Uncategorized',999]]

const snapshot=(database,productId)=>({
  product:database.prepare('SELECT id,product_code,full_name,category_id FROM material_products WHERE id=?').get(productId),
  levels:database.prepare('SELECT id,price_amount,price_cents,product_id FROM material_price_levels WHERE product_id=? ORDER BY id').all(productId),
  assignments:database.prepare('SELECT id,branch_id,product_id,price_level_id FROM branch_product_price_assignments WHERE product_id=? ORDER BY id').all(productId),
  assignmentHistory:database.prepare('SELECT COUNT(*) count FROM branch_product_price_assignment_history WHERE product_id=?').get(productId).count,
  priceHistory:database.prepare('SELECT COUNT(*) count FROM product_price_group_history WHERE product_id=?').get(productId).count,
})

export function applyV25Migration(database,{actor='Schema v25 OCC Category migration'}={}){
  const version=Number(database.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version<24)throw new Error(`Schema v24 is required before v25; current schema is v${version}`)
  const integrity=database.prepare('PRAGMA integrity_check').get().integrity_check
  if(integrity!=='ok')throw new Error(`Database integrity check failed: ${integrity}`)
  database.exec('BEGIN IMMEDIATE')
  try{
    const occ=database.prepare("SELECT * FROM material_products WHERE product_code='OCC'").all()
    if(occ.length!==1)throw new Error(`Expected exactly one OCC Product; found ${occ.length}`)
    const before=snapshot(database,occ[0].id)
    let categoriesCreated=0,productsMoved=0,historyCreated=0
    for(const [code,name,sort] of expectedOrder){
      const existing=database.prepare('SELECT id,category_name FROM material_categories WHERE category_code=?').get(code)
      if(existing&&existing.category_name!==name)throw new Error(`Category ${code} has unexpected name ${existing.category_name}`)
      if(!existing)categoriesCreated+=Number(database.prepare('INSERT INTO material_categories(category_code,category_name,sort_order,system_reserved,created_by) VALUES(?,?,?,?,?)').run(code,name,sort,code==='UNCATEGORIZED'?1:0,actor).changes)
      else database.prepare('UPDATE material_categories SET sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(sort,existing.id)
    }
    const target=database.prepare("SELECT id FROM material_categories WHERE category_code='OCC'").get()
    if(Number(occ[0].category_id)!==Number(target.id)){
      database.prepare('UPDATE material_products SET category_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(target.id,occ[0].id)
      historyCreated+=Number(database.prepare("INSERT OR IGNORE INTO material_product_category_history(product_id,old_category_id,new_category_id,reason,changed_by,action) VALUES(?,?,?,?,?,'migration_v25')").run(occ[0].id,occ[0].category_id,target.id,'Approved OCC independent Category',actor).changes)
      productsMoved=1
    }
    const paperCount=database.prepare("SELECT COUNT(*) count FROM material_products p JOIN material_categories c ON c.id=p.category_id WHERE c.category_code='PAPER'").get().count
    if(paperCount!==3)throw new Error(`Paper must contain exactly 3 Products after OCC move; found ${paperCount}`)
    const after=snapshot(database,occ[0].id)
    if(JSON.stringify(before.levels)!==JSON.stringify(after.levels)||JSON.stringify(before.assignments)!==JSON.stringify(after.assignments)||before.assignmentHistory!==after.assignmentHistory||before.priceHistory!==after.priceHistory)throw new Error('OCC prices, assignments, or history changed unexpectedly')
    database.prepare('INSERT OR IGNORE INTO schema_meta(version) VALUES(?)').run(V25_VERSION)
    database.exec('COMMIT')
    return{schemaVersion:V25_VERSION,categoriesCreated,productsMoved,historyCreated,categoryCount:database.prepare('SELECT COUNT(*) count FROM material_categories').get().count,paperProductCount:paperCount,occProductId:occ[0].id,occPriceGroupCount:after.levels.length,occAssignmentCount:after.assignments.length}
  }catch(error){database.exec('ROLLBACK');throw error}
}

export {expectedOrder as V25_CATEGORY_ORDER}
