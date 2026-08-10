import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {messages} from '../src/translations.js'

const page=readFileSync(new URL('../src/MasterDataPage.jsx',import.meta.url),'utf8')
const css=readFileSync(new URL('../src/MasterDataPage.css',import.meta.url),'utf8')

test('GPS supervisor review labels are explicit in every locale',()=>{
  for(const language of ['en','ms','zh'])assert.deepEqual(
    ['gps.adoptOfficial','gps.keepOfficial','gps.recapture','gps.reject'].map(key=>messages[language][key]),
    ['Confirm & Save as Official GPS','Keep Existing GPS','Recollect GPS','Reject']
  )
})

test('GPS review action order and values remain unchanged',()=>{
  const actions=[...page.matchAll(/review\(item,'([^']+)'\)\}>\{t\('gps\.([^']+)'\)\}/g)].map(match=>[match[1],match[2]])
  assert.deepEqual(actions,[['adopt','adoptOfficial'],['keep_official','keepOfficial'],['recapture','recapture'],['reject','reject']])
})

test('review labels wrap safely on desktop and mobile',()=>{
  assert.match(css,/\.gps-review-actions button\{[^}]*white-space:normal;[^}]*overflow-wrap:anywhere/)
  assert.match(css,/@media\(max-width:600px\)\{\.gps-review-actions button\{flex-basis:100%\}\}/)
})
