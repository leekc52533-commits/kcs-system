import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql,SCHEMA_VERSION} from '../server/schema.mjs'
import {getRouteTemplate} from '../server/routeTemplateService.mjs'
import {messages} from '../src/translations.js'

const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
const hubs=fs.readFileSync(new URL('../src/WorkspaceHub.jsx',import.meta.url),'utf8')
const resources=fs.readFileSync(new URL('../src/ResourcePage.jsx',import.meta.url),'utf8')
const zones=fs.readFileSync(new URL('../src/ZoneGroupManager.jsx',import.meta.url),'utf8')

test('Area Zone Manage Route opens the one registered Dispatch route with Zone context',()=>{
  assert.match(zones,/onClick=\{\(\)=>setRouteZone\(group\)\}/)
  assert.match(zones,/const setRouteZone=group=>onOpenRoute\?\.\(group\.id\)/)
  assert.match(resources,/onOpenRoute=\{onOpenRoute\}/)
  assert.match(hubs,/initialTab==='route-template'/)
  assert.match(hubs,/RouteTemplatePage zoneId=\{routeZoneId\}/)
  assert.match(app,/tab=route-template&zone=\$\{encodeURIComponent\(value\)\}/)
})

test('direct URL, refresh and Back preserve or restore the Route Template context',()=>{
  assert.match(app,/new URLSearchParams\(window\.location\.search\)\.get\('zone'\)/)
  assert.match(app,/setRouteZoneId\(query\.get\('zone'\)\|\|''\)/)
  assert.match(app,/routeTemplateFrom:true/)
  assert.match(app,/if\(window\.history\.state\?\.routeTemplateFrom\)window\.history\.back\(\);else changeTab\('area-zone'\)/)
  assert.match(zones,/onClose=onBack/)
})

test('every valid Zone can render an empty not-yet-configured Route Template safely',()=>{
  const db=new DatabaseSync(':memory:')
  db.exec(`PRAGMA foreign_keys=ON;${schemaSql}`)
  for(const id of [1,2]){
    const value=getRouteTemplate(id,db)
    assert.equal(value.zone.id,id)
    assert.equal(value.template,null)
    assert.deepEqual(value.routes,[])
    assert.deepEqual(value.unassignedAreas,[])
  }
  assert.equal(SCHEMA_VERSION,38)
})

test('Route Template direct access remains Session-authorized and new route labels are trilingual',()=>{
  const api=fs.readFileSync(new URL('../server/index.mjs',import.meta.url),'utf8')
  assert.match(api,/GET[^\n]+route-template[^\n]+canManageSchedules\(session\)[^\n]+403/)
  for(const key of ['loadingZone','invalidZone']){
    for(const language of ['en','ms','zh'])assert.ok(messages[language][`routeTemplate.${key}`])
    assert.notEqual(messages.ms[`routeTemplate.${key}`],messages.en[`routeTemplate.${key}`])
  }
})
