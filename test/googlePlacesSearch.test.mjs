import test from 'node:test'
import assert from 'node:assert/strict'
import {searchGooglePlaces} from '../server/googleGeocodingService.mjs'
import {translateUi} from '../src/translations.js'

test('business search preserves names and addresses, lists branches and biases without restricting',async()=>{
 const result=await searchGooglePlaces(' HNL BBS ',{apiKey:'test-key',fetchImpl:async(url,options)=>{
  assert.equal(url,'https://places.googleapis.com/v1/places:searchText')
  const body=JSON.parse(options.body)
  assert.equal(body.textQuery,'HNL BBS');assert.equal(body.locationRestriction,undefined)
  assert.equal(options.headers['X-Goog-Api-Key'],'test-key')
  return{ok:true,json:async()=>({places:[{id:'1',displayName:{text:'HNL BBS'},formattedAddress:'Jalan A',location:{latitude:1.5,longitude:110.3}},{id:'2',displayName:{text:'HNL BBS 2'},formattedAddress:'Jalan B',location:{latitude:1.6,longitude:110.4}},{id:'bad',location:{latitude:null,longitude:110}}]})}
 }})
 assert.equal(result.candidates.length,2);assert.equal(result.candidates[0].name,'HNL BBS');assert.equal(result.candidates[1].address,'Jalan B')
})
test('empty search and invalid coordinates cannot become map results',async()=>{
 await assert.rejects(searchGooglePlaces(' '),{statusCode:400})
 for(const places of [[],[{location:{latitude:91,longitude:0}}],[{location:{latitude:'',longitude:0}}]])await assert.rejects(searchGooglePlaces('shop',{apiKey:'x',fetchImpl:async()=>({ok:true,json:async()=>({places})})}),{statusCode:404})
})
test('configuration denial and network failure are actionable without exposing keys',async()=>{
 await assert.rejects(searchGooglePlaces('shop',{apiKey:''}),{statusCode:503})
 await assert.rejects(searchGooglePlaces('shop',{apiKey:'secret',fetchImpl:async()=>({ok:false,status:403})}),/Enable Places API \(New\)/)
 await assert.rejects(searchGooglePlaces('shop',{apiKey:'secret',fetchImpl:async()=>{throw new Error('secret')}}),{message:'Map search is temporarily unavailable.'})
})
test('search prompt and setup error support Chinese and Malay',()=>{
 for(const language of ['zh','ms'])for(const key of ['Search customer / branch name or address','Enable Places API (New) and authorize the server API key in Google Cloud.'])assert.notEqual(translateUi(language,key),key)
})
