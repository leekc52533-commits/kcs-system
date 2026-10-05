import test from 'node:test'
import assert from 'node:assert/strict'
import {translateNoticeSource} from '../server/noticeTranslation.mjs'
import {noticeText} from '../shared/noticeLanguages.js'
const source={title:'Serian A 通告',body:'没有到 Kuching MPKS，不可填写理由。QAV3468 / OCC / TN20860',sourceLanguage:'zh'}
function response(output){return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]}))}
test('translation masks identifiers, uses structured output, and restores exact names',async()=>{
 const result=await translateNoticeSource(source,{apiKey:'test-only',fetchImpl:async(url,init)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');const request=JSON.parse(init.body),data=JSON.parse(request.input)
  assert.equal(request.store,false);assert.equal(request.text.format.strict,true)
  for(const name of ['Serian A','Kuching MPKS','QAV3468','OCC','TN20860'])assert.ok(!request.input.includes(name))
  return response({ms:{title:data.title.replace('通告','Notis'),body:data.body.replace('没有到','Belum pergi ke').replace('不可填写理由','jangan isi alasan')},en:{title:data.title.replace('通告','Notice'),body:data.body.replace('没有到','Without visiting').replace('不可填写理由','do not enter reasons')}})
 }})
 assert.equal(result.status,'ready');assert.equal(result.translations.zh.body,source.body)
 for(const lang of ['ms','en'])for(const name of ['Kuching MPKS','QAV3468','OCC','TN20860'])assert.ok(result.translations[lang].body.includes(name))
})
test('one corrupt language falls back while good translation survives',async()=>{
 const r=await translateNoticeSource(source,{apiKey:'test',fetchImpl:async(url,init)=>{const data=JSON.parse(JSON.parse(init.body).input);return response({ms:{title:'Lost name',body:'Lost plate'},en:{title:data.title,body:data.body}})}})
 assert.deepEqual(r.failedLanguages,['ms']);assert.ok(r.translations.en);assert.equal(noticeText({...source,...r},'ms').body,source.body)
})
test('missing key, provider error, timeout, malformed JSON and refusal preserve original',async()=>{
 const missing=await translateNoticeSource(source,{apiKey:'',fetchImpl:()=>{throw Error('must not call')}});assert.equal(missing.status,'notConfigured')
 for(const fetchImpl of [async()=>new Response('',{status:429}),async()=>{throw Error('timeout')},async()=>new Response('invalid'),async()=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'refusal',refusal:'No'}]}]}))]){
  const r=await translateNoticeSource(source,{apiKey:'test',fetchImpl});assert.equal(r.status,'failed');assert.deepEqual(r.translations.zh,{title:source.title,body:source.body});assert.equal(noticeText({...source,...r},'en').title,source.title)
 }
})
test('legacy and partial versions use per-field original fallback',()=>{
 assert.deepEqual(noticeText(source,'ms'),{title:source.title,body:source.body})
 assert.deepEqual(noticeText({...source,translations:{ms:{title:'Notis',body:''}}},'ms'),{title:'Notis',body:source.body})
})
test('provider failures expose only safe actionable codes, never provider text or key',async()=>{
 for(const [status,code,expected] of [[401,'invalid_api_key','invalidKey'],[429,'insufficient_quota','quotaExceeded'],[403,'','permissionDenied'],[429,'','rateLimited'],[404,'','modelUnavailable'],[500,'','providerUnavailable']]){
  const r=await translateNoticeSource(source,{apiKey:'secret-key',fetchImpl:async()=>new Response(JSON.stringify({error:{code,message:'secret-key private provider text'}}),{status})});
  assert.equal(r.errorCode,expected);assert.equal(r.status,'failed');assert.ok(!JSON.stringify(r).includes('secret-key'));assert.deepEqual(r.failedLanguages,['ms','en']);
 }
});
test('timeouts have distinct diagnostics and preserve original',async()=>{
 const r=await translateNoticeSource(source,{apiKey:'test',fetchImpl:async()=>{throw new DOMException('timeout','TimeoutError')}});
 assert.equal(r.errorCode,'translationTimeout');assert.equal(r.translations.zh.body,source.body);
});
