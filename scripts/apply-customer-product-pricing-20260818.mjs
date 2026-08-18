import {DatabaseSync} from 'node:sqlite'
import {runApprovedCustomerProductPricingBatch} from '../server/customerProductPricingBatchService.mjs'

const databasePath=process.env.KCS_DB_PATH
if(!databasePath)throw new Error('KCS_DB_PATH is required')
const database=new DatabaseSync(databasePath)
database.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;')
try{
  const schemaVersion=Number(database.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(schemaVersion!==42)throw new Error(`Expected Schema v42, found v${schemaVersion}`)
  const result=runApprovedCustomerProductPricingBatch(database,{apply:process.argv.includes('--apply')})
  console.log(JSON.stringify({databasePath,schemaVersion,...result},null,2))
}finally{database.close()}
