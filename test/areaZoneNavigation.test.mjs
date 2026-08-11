import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
const hubs=readFileSync(new URL('../src/WorkspaceHub.jsx',import.meta.url),'utf8')
const translations=readFileSync(new URL('../src/translations.js',import.meta.url),'utf8')

test('Area Zone assignment is rendered only inside Dispatch scheduling',()=>{
  const dispatch=hubs.match(/export function DispatchScheduleHub[\s\S]*?export function CustomerBranchHub/)?.[0]||''
  const locations=hubs.match(/export function LocationGpsZoneHub[\s\S]*$/)?.[0]||''
  assert.match(dispatch,/\['area-zone',t\('hub\.areaZone'\)\]/)
  assert.match(dispatch,/initialTab="zones"/)
  assert.doesNotMatch(locations,/\['area-zone',t\('hub\.areaZone'\)\]/)
  assert.doesNotMatch(locations,/initialTab="zones"/)
})

test('legacy Location Area Zone bookmark resolves to the Dispatch workspace',()=>{
  assert.match(app,/page==='location-zone'&&pageTab==='area-zone'\?\{page:'operations',tab:'area-zone'\}/)
  assert.match(app,/return resolvePage\(raw,query\.get\('tab'\)\|\|''\)/)
})

test('Area Zone label remains complete in English Malay and Chinese',()=>{
  assert.match(translations,/'hub\.areaZone':'Area \/ Zone Assignment'/)
  assert.match(translations,/'hub\.areaZone':'Penetapan Area \/ Zon'/)
  assert.match(translations,/'hub\.areaZone':'Area／Zone归属'/)
})
