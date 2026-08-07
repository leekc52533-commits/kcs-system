import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'

const css=readFileSync(new URL('../src/interactive.css',import.meta.url),'utf8')
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
const employees=readFileSync(new URL('../src/EmployeeMasterPage.jsx',import.meta.url),'utf8')
const vehicles=readFileSync(new URL('../src/ResourcePage.jsx',import.meta.url),'utf8')
const pricing=readFileSync(new URL('../src/MasterDataPage.css',import.meta.url),'utf8')

test('shared interaction stylesheet is loaded and defines the long-term feedback tokens',()=>{
  assert.match(app,/import '\.\/interactive\.css'/)
  assert.match(css,/--interactive-border:/)
  assert.match(css,/--interactive-border-hover:/)
  assert.match(css,/--interactive-focus:/)
  assert.match(css,/cursor:\s*pointer/)
  assert.match(css,/:focus-visible/)
  assert.match(css,/:active/)
})

test('disabled and read-only content are not presented as clickable',()=>{
  assert.match(css,/button:disabled[\s\S]*cursor:\s*not-allowed/)
  assert.doesNotMatch(css,/(^|,)\s*(article|p|span|div)\s*\{[^}]*cursor:\s*pointer/m)
})

test('interactive cards have clear default, hover, focus and pressed feedback',()=>{
  assert.match(css,/\.interactive-card[\s\S]*border-color:\s*var\(--interactive-border\)/)
  assert.match(css,/\.interactive-card[\s\S]*:hover[\s\S]*var\(--interactive-border-hover\)/)
  assert.match(css,/\.interactive-card[\s\S]*:focus-visible[\s\S]*var\(--interactive-focus\)/)
  assert.match(css,/\.interactive-card[\s\S]*:active[\s\S]*var\(--interactive-pressed\)/)
  assert.match(vehicles,/vehicle-master-card[^\n]*interactive-card/)
  assert.match(pricing,/price-level-grid article\[role="button"\]/)
})

test('employee rows remain clickable and gain keyboard operation',()=>{
  assert.match(employees,/<tr key=\{item\.id\} role="button" tabIndex="0" className=\{`interactive-row/)
  assert.match(employees,/event\.key==='Enter'\|\|event\.key===' '/)
})

test('shared rules preserve compact mobile layouts and reduced motion preferences',()=>{
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/)
  assert.doesNotMatch(css,/min-width:\s*\d/)
  assert.doesNotMatch(css,/width:\s*\d/)
})

test('Material, Product and Price Group cards use one neutral white base',()=>{
  assert.match(css,/Material, Product and Price Group cards share one neutral base/)
  assert.match(css,/\.category-grid > article,[\s\S]*\.material-grid > button,[\s\S]*\.price-level-grid > article,[\s\S]*background-color:\s*#fff/)
  assert.match(css,/\.price-level-grid > article\.price-not-set/)
  assert.match(css,/\.price-level-grid > article\.active/)
  assert.match(css,/\.price-level-grid > article\.inactive/)
  assert.match(css,/\.price-level-grid > article\.unused/)
})
