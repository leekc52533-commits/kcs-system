import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const source=readFileSync(new URL('../src/MasterDataPage.jsx',import.meta.url),'utf8')
const css=readFileSync(new URL('../src/MasterDataPage.css',import.meta.url),'utf8')
const server=readFileSync(new URL('../server/index.mjs',import.meta.url),'utf8')

test('Buyer Branch cards open the editor with mouse and keyboard feedback',()=>{assert.match(source,/className="interactive-card buyer-branch-card"/);assert.match(source,/onClick=\{\(\)=>openBranch\(branch\)\}/);assert.match(source,/event\.key==='Enter'\|\|event\.key===' '/);assert.match(css,/\.buyer-branch-card\{cursor:pointer/);assert.match(css,/@media\(max-width:600px\).*\.buyer-branch-card\{width:100%;max-width:100%\}/s)})
test('Buyer Branch editor shows immutable typed identity and parent while exposing branch fields',()=>{assert.match(source,/\['buyerBranchId','Buyer Branch ID','readonly'\]/);assert.match(source,/\['parentBuyerDisplay','Parent Buyer','readonly'\]/);for(const field of ['branchName','address','latitude','longitude','contactPerson','phone','businessHours','acceptedMaterials','unloadingRestrictions','priceNotes','operationalNotes','canEnd','status'])assert.match(source,new RegExp(`\\['${field}'`));assert.match(source,/parentBuyerDisplay:`\$\{formatBuyerId\(selected\.id\)\} — \$\{selected\.buyerName\}`/)})
test('PATCH payload strips immutable relation fields, refreshes Buyer detail, and server permissions remain enforced',()=>{for(const key of ['buyerBranchId','buyerId','buyerInternalId','parentBuyerId','parentBuyerDisplay'])assert.match(source,new RegExp(`'${key}'`));assert.match(source,/await api\(edit\?`\/api\/buyer-branches\/\$\{form\.id\}`/);assert.match(source,/setEditingBranch\(null\);await open\(selected\)/);assert.match(server,/canManageBuyers=session=>\['owner_admin','operations_admin','supervisor','office'\]/);assert.match(server,/if\(!canManageBuyers\(session\)\)return sendJson\(response,403/);assert.match(server,/request\.method === 'PATCH' && \/\^\\\/api\\\/buyer-branches/)} )
