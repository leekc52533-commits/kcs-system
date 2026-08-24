import test from 'node:test'
import assert from 'node:assert/strict'
import {GoogleRouteOptimizationClient} from '../server/googleRouteOptimizationClient.mjs'

const adcEnv={KCS_GOOGLE_ROUTE_OPTIMIZATION_ENABLED:'1',GOOGLE_CLOUD_PROJECT:'project',GOOGLE_APPLICATION_CREDENTIALS:'/not/a/real/path'}
const response=()=>({ok:true,json:async()=>({routes:[]})})

function authHarness({now=()=>0,expiry=now()+60*60*1000,fail=false,delay=false}={}){
  let authLoads=0,tokenLoads=0,release
  const gate=delay?new Promise(resolve=>{release=resolve}):null
  const client={credentials:{expiry_date:expiry},async getAccessToken(){tokenLoads++;if(gate)await gate;if(fail)throw new Error('sensitive credential failure');return{token:`token-${tokenLoads}`}}}
  return{authFactory:async project=>{authLoads++;assert.equal(project,'project');return{getClient:async()=>client}},counts:()=>({authLoads,tokenLoads}),release}
}

test('ADC loads through the official auth adapter, acquires a token, and never calls metadata',async()=>{
  let now=1_000_000
  const auth=authHarness({now:()=>now,expiry:now+60*60*1000}),requests=[]
  const client=new GoogleRouteOptimizationClient({env:adcEnv,authFactory:auth.authFactory,now:()=>now,fetchImpl:async(url,options)=>{requests.push({url,options});return response()}})
  await client.optimize({shipments:[]})
  assert.equal(auth.counts().tokenLoads,1)
  assert.equal(requests.length,1)
  assert.match(requests[0].url,/routeoptimization\.googleapis\.com/)
  assert.doesNotMatch(requests[0].url,/metadata/)
})

test('ADC token cache is reused and refreshed before and after expiry',async()=>{
  let now=1_000_000
  const auth=authHarness({now:()=>now,expiry:now+60*60*1000})
  const client=new GoogleRouteOptimizationClient({env:adcEnv,authFactory:auth.authFactory,now:()=>now,fetchImpl:async()=>response()})
  assert.equal(await client.token(),'token-1')
  now+=54*60*1000
  assert.equal(await client.token(),'token-1')
  now+=2*60*1000
  assert.equal(await client.token(),'token-2')
  now+=10*60*1000
  assert.equal(await client.token(),'token-3')
  assert.deepEqual(auth.counts(),{authLoads:1,tokenLoads:3})
})

test('concurrent callers share one ADC refresh',async()=>{
  const auth=authHarness({delay:true})
  const client=new GoogleRouteOptimizationClient({env:adcEnv,authFactory:auth.authFactory,now:()=>0})
  const tokens=Promise.all([client.token(),client.token(),client.token()])
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(auth.counts().tokenLoads,1)
  auth.release()
  assert.deepEqual(await tokens,['token-1','token-1','token-1'])
})

test('ADC failure is closed, generic, and occurs before a Google route request',async()=>{
  const auth=authHarness({fail:true}),secretPath=adcEnv.GOOGLE_APPLICATION_CREDENTIALS
  let calls=0
  const client=new GoogleRouteOptimizationClient({env:adcEnv,authFactory:auth.authFactory,fetchImpl:async()=>{calls++;return response()}})
  await assert.rejects(()=>client.optimize({}),error=>error.code==='GOOGLE_AUTH_UNAVAILABLE'&&!error.message.includes(secretPath)&&!error.message.includes('sensitive'))
  assert.equal(calls,0)
})

test('diagnostics report non-secret auth mode and readiness',()=>{
  const adc=new GoogleRouteOptimizationClient({env:adcEnv}),staticClient=new GoogleRouteOptimizationClient({env:{...adcEnv,GOOGLE_ROUTE_OPTIMIZATION_ACCESS_TOKEN:'secret-token'}}),none=new GoogleRouteOptimizationClient({env:{KCS_GOOGLE_ROUTE_OPTIMIZATION_ENABLED:'1',GOOGLE_CLOUD_PROJECT:'project'}})
  assert.deepEqual({mode:adc.diagnostics().authMode,ready:adc.diagnostics().ready},{mode:'adc',ready:true})
  assert.deepEqual({mode:staticClient.diagnostics().authMode,ready:staticClient.diagnostics().ready},{mode:'static_token',ready:true})
  assert.deepEqual({mode:none.diagnostics().authMode,ready:none.diagnostics().ready},{mode:'none',ready:false})
  const serialized=JSON.stringify([adc.diagnostics(),staticClient.diagnostics(),none.diagnostics()])
  assert.doesNotMatch(serialized,/not\/a\/real|secret-token|GOOGLE_APPLICATION_CREDENTIALS/)
})

test('explicit static token overrides ADC without loading credentials',async()=>{
  let authLoads=0,authorization
  const client=new GoogleRouteOptimizationClient({env:{...adcEnv,GOOGLE_ROUTE_OPTIMIZATION_ACCESS_TOKEN:'override'},authFactory:async()=>{authLoads++;throw new Error('must not load')},fetchImpl:async(_url,options)=>{authorization=options.headers.Authorization;return response()}})
  await client.optimize({})
  assert.equal(authLoads,0)
  assert.equal(authorization,'Bearer override')
})
