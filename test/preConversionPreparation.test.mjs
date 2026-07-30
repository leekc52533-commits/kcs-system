import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {sortMaterials} from '../shared/materialOrder.js'

test('material order is OCC, Mix Paper, Iron, Aluminium Can, Plastic, E-waste, then others',()=>{
  const items=[
    {materialName:'Zinc'},
    {materialName:'Plastic'},
    {materialName:'Aluminum Can'},
    {materialName:'EWASTE'},
    {materialName:'Iron'},
    {materialName:'OCC'},
    {materialName:'Bristol Paper'},
  ]
  assert.deepEqual(sortMaterials(items).map(item=>item.materialName),[
    'OCC','Bristol Paper','Iron','Aluminum Can','Plastic','EWASTE','Zinc',
  ])
})

test('material aliases share the same stable category order',()=>{
  const items=[
    {materialName:'Other'},
    {materialName:'Aluminium Can'},
    {materialName:'E-waste'},
    {materialName:'Mix Paper'},
  ]
  assert.deepEqual(sortMaterials(items).map(item=>item.materialName),[
    'Mix Paper','Aluminium Can','E-waste','Other',
  ])
})

test('employee actions are distinct and preview export uses preview rows',()=>{
  const source=fs.readFileSync(new URL('../src/EmployeeMasterPage.jsx',import.meta.url),'utf8')
  assert.match(source,/employee\.downloadImportTemplate/)
  assert.match(source,/employee\.exportData/)
  assert.match(source,/employee\.exportPreview/)
  assert.match(source,/preview\.rows\.map/)
  assert.doesNotMatch(source,/>Download<\/button><button[^>]*>Download</)
})

test('Employee ID stays internal and is not rendered as an editable detail field',()=>{
  const source=fs.readFileSync(new URL('../src/EmployeeMasterPage.jsx',import.meta.url),'utf8')
  assert.doesNotMatch(source,/<label>Employee ID<input/)
  assert.doesNotMatch(source,/Employee ID \{item\.id\}/)
  assert.match(source,/employeeId:id/)
})
