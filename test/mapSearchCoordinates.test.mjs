import test from 'node:test'
import assert from 'node:assert/strict'
import {coordinatesFromMapSearch} from '../src/gpsCoordinates.js'
test('map search distinguishes places from coordinates and preserves exact position',()=>{
 for(const query of ['1.5533, 110.3592','(1.5533，110.3592)','1.5533;110.3592'])assert.deepEqual(coordinatesFromMapSearch(query),{latitude:'1.5533',longitude:'110.3592'})
 for(const query of ['Alpro 101','11, Jalan Tun Jugah','Muscle Peak Kuching','101'])assert.equal(coordinatesFromMapSearch(query),null)
 assert.throws(()=>coordinatesFromMapSearch('91,110'),/Latitude/)
 assert.throws(()=>coordinatesFromMapSearch('1,181'),/Longitude/)
})
