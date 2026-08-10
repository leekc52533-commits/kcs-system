import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const shared=readFileSync(new URL('../src/SharedGpsInput.jsx',import.meta.url),'utf8')

test('Paste Coordinates is visually and structurally blank for a new GPS draft',()=>{
  assert.match(shared,/Paste Coordinates<input value=\{paste\} placeholder=""/)
  assert.match(shared,/const\[paste,setPaste\]=useState\(''\)/)
  assert.doesNotMatch(shared,/1\.4449047|110\.3337165/)
  assert.match(shared,/disabled=\{!paste\.trim\(\)\|\|Boolean\(busy\)\}/)
})

test('entity reset remains responsible for clearing paste, marker and source state',()=>{
  assert.match(shared,/SharedGpsInputState key=\{resetKey\|\|'shared-gps-input'\}/)
  assert.match(shared,/useState\(gpsSource\|\|''\)/)
  assert.match(shared,/setPickerOpen\(false\)/)
})
