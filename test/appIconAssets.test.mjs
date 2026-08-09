import test from 'node:test'
import assert from 'node:assert/strict'
import {existsSync,readFileSync} from 'node:fs'

const publicUrl=new URL('../public/',import.meta.url),html=readFileSync(new URL('../index.html',import.meta.url),'utf8')
const dimensions=file=>{const data=readFileSync(new URL(`icons/${file}`,publicUrl));assert.equal(data.toString('ascii',1,4),'PNG');return[data.readUInt32BE(16),data.readUInt32BE(20)]}

test('KCS master icon derivatives keep exact square dimensions',()=>{
  for(const size of [16,32,48,180,192,512])assert.deepEqual(dimensions(`kcs-app-icon-${size}.png`),[size,size])
  assert.ok(existsSync(new URL('icons/kcs-app-icon.png',publicUrl)))
  assert.ok(existsSync(new URL('icons/favicon.ico',publicUrl)))
})

test('favicon, Apple touch icon and PWA manifest use only KCS icon assets',()=>{
  for(const reference of ['/icons/kcs-app-icon-16.png','/icons/kcs-app-icon-32.png','/icons/favicon.ico','/icons/kcs-app-icon-180.png','/manifest.webmanifest'])assert.ok(html.includes(reference))
  const manifest=JSON.parse(readFileSync(new URL('manifest.webmanifest',publicUrl),'utf8'))
  assert.deepEqual(manifest.icons.map(icon=>[icon.src,icon.sizes]),[['/icons/kcs-app-icon-192.png','192x192'],['/icons/kcs-app-icon-512.png','512x512']])
  assert.equal(manifest.name,'KCS Dispatch System')
  assert.ok(!existsSync(new URL('favicon.svg',publicUrl)))
})
