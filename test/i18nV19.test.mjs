import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {messages,translate,translateSource} from '../src/translations.js'
import {assertLocationFields,assertLocationText,containsCjk} from '../shared/locationText.js'
import {errorCodeFor,publicError} from '../server/errorCodes.mjs'

const currentPages=[
  'App.jsx','AccountManagementPage.jsx','AuthPages.jsx','DataPages.jsx','EmployeeMasterPage.jsx',
  'GpsMigrationPage.jsx','GpsZoneRecommendationPage.jsx','ImportPage.jsx','MasterDataPage.jsx',
  'MaterialsPricesPage.jsx','ResourcePage.jsx','SpecialRequestsPage.jsx','VehicleDetailPage.jsx',
  'WeeklyDispatchPage.jsx','ZoneGroupManager.jsx'
]

test('三种语言模块key数量一致且关键操作完整',()=>{
  const counts=['en','ms','zh'].map(language=>Object.keys(messages[language]).length)
  assert.equal(counts[0],counts[1]);assert.equal(counts[1],counts[2])
  for(const language of ['en','ms','zh'])for(const key of ['common.save','common.cancel','branch.materials','material.bulkUpdate','employee.rehire','vehicle.maintenance','dispatch.approvePublish','specialRequest.create','zone.confirm','gps.adopt','import.confirm','schedule.title','apiError.permission_denied'])assert.notEqual(translate(language,key),key)
})

test('English和Bahasa Melayu关键上线界面翻译不包含CJK',()=>{
  const sources=['客户与分店','员工、车辆、地点与区域','收货排程','GPS 与资料完整度','新增','关闭','保存','载入中…','查看详情','未设置','Materials & Prices','Vehicle Master','Special Collection Requests','Weekly Dispatch Planner']
  for(const language of ['en','ms'])for(const source of sources)assert.equal(containsCjk(translateSource(language,source)),false,`${language}: ${source}`)
})

test('缺少翻译key安全回退English并在开发环境保留稳定key',()=>{
  const key='test.missing.translation'
  assert.equal(translate('ms',key),key)
  assert.equal(translate('zh',key),key)
})

test('数据库地点原值不会因为切换语言而改变',()=>{
  const values=['Lundu / Bau','Jalan Pending, Kuching','BDC Industrial Estate','Samarahan A']
  for(const language of ['en','ms','zh'])for(const value of values)assert.equal(translateSource(language,value),value)
})

test('地点、地址、Zone和Area拒绝CJK但接受English或Bahasa Melayu',()=>{
  for(const value of ['Lundu / Bau','Jalan Datuk Tawi Sli','Kuching A — BDC'])assert.equal(assertLocationText(value),value)
  for(const value of ['伦乐','石隆门','马来西亚地址'])assert.throws(()=>assertLocationText(value),error=>error.code==='INVALID_LOCATION_TEXT')
  assert.throws(()=>assertLocationFields({name:'古晋 A区',address:'Jalan Pending'},['name','address']),error=>error.code==='INVALID_LOCATION_TEXT')
})

test('主要API错误映射为稳定错误码及三语信息',()=>{
  assert.equal(errorCodeFor(new Error('用户名或密码错误，或账号暂时被锁定')),'INVALID_CREDENTIALS')
  assert.equal(errorCodeFor(Object.assign(new Error('bad place'),{code:'INVALID_LOCATION_TEXT'})),'INVALID_LOCATION_TEXT')
  assert.deepEqual(publicError(new Error('SQLITE_INTERNAL private path')),{errorCode:'UNKNOWN_ERROR',error:'The request could not be completed.'})
  for(const language of ['en','ms','zh'])assert.notEqual(translate(language,'apiError.invalid_location_text'),'apiError.invalid_location_text')
})

test('旧DispatchPage已删除且当前上线页面存在',()=>{
  assert.equal(fs.existsSync(new URL('../src/DispatchPage.jsx',import.meta.url)),false)
  for(const page of currentPages)assert.equal(fs.existsSync(new URL(`../src/${page}`,import.meta.url)),true,page)
})

test('390px手机布局有响应式保护且不设全局固定最小宽度',()=>{
  const css=fs.readFileSync(new URL('../src/App.css',import.meta.url),'utf8')+fs.readFileSync(new URL('../src/index.css',import.meta.url),'utf8')
  assert.match(css,/@media\s*\([^)]*max-width\s*:\s*(?:560|640|720|768|820|900)px/)
  assert.doesNotMatch(css,/(?:html|body|#root)\s*\{[^}]*min-width\s*:\s*[4-9]\d{2}px/s)
})
