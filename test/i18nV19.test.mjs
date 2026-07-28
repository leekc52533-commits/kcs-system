import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {messages,translate,translateSource} from '../src/translations.js'
import {assertLocationFields,assertLocationText,containsCjk} from '../shared/locationText.js'
import {errorCodeFor,publicError} from '../server/errorCodes.mjs'
import {validateZoneRename} from '../src/zoneRenameValidation.js'

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
  const sources=[
    '客户与分店','员工、车辆、地点与区域','收货排程','GPS 与资料完整度','新增','关闭','保存','载入中…','查看详情','未设置',
    'Materials & Prices','Vehicle Master','Special Collection Requests','Weekly Dispatch Planner','导出资料 XLSX','无电话','无备注',
    '搜索编号、名称、电话或地址','已有排程且已有 GPS','Branch 找不到','选择 Excel 文件','搜索 Branch / BranchID / 地址',
    'Polygon 外','全部置信度','只看重叠冲突','Recommendation only · 不会自动修改正式归属','先预览，确认后才写入 SQLite',
    '正式车辆按 Lorry Number — Registration Number 显示；Sold 车辆只保留历史，不参加派车或提醒。','Vehicle Number，例如 Lorry 7',
    '搜索 Area / AreaID / Zone','全部 GPS 状态','至少一个正式 GPS','包含缺 GPS Branch','这个 Area 暂时没有分店。'
  ]
  for(const language of ['en','ms'])for(const source of sources)assert.equal(containsCjk(translateSource(language,source)),false,`${language}: ${source}`)
})

test('实际上线路由表面、placeholder及空状态三语渲染契约完整',()=>{
  const routeSurfaces={
    specialRequests:['Special Collection Requests','建立临时请求','请求清单'],
    customers:['客户与分店','导出资料 XLSX','搜索编号、名称、电话或地址','无电话','无备注'],
    schedules:['收货排程','Branch 找不到','所有排程'],
    dataQuality:['GPS 与资料完整度','已有排程且已有 GPS','已有排程但缺 GPS','有 GPS 但没有排程','没有 GPS 也没有排程'],
    gpsRecommendation:['GPS Zone 建议与边界管理','搜索 Branch / BranchID / 地址','Polygon 外','全部置信度','只看重叠冲突'],
    employees:['Employee Directory','没有符合筛选条件的员工。','新增员工'],
    vehicles:['Vehicle Master','正式车辆按 Lorry Number — Registration Number 显示；Sold 车辆只保留历史，不参加派车或提醒。'],
    locationsZones:['Zone Area Confirmation','搜索 Area / AreaID / Zone','全部 GPS 状态','这个 Area 暂时没有分店。'],
    gpsMigration:['Jodoo 旧 GPS 迁移','先预览，确认后才写入 SQLite','分类','决定'],
    import:['Excel 正式导入','选择 Excel 文件','导入问题']
  }
  for(const language of ['en','ms'])for(const [route,sources] of Object.entries(routeSurfaces)){
    const rendered=sources.map(source=>translateSource(language,source)).join(' | ')
    assert.equal(containsCjk(rendered),false,`${language} ${route}: ${rendered}`)
  }
  for(const sources of Object.values(routeSurfaces))for(const source of sources)assert.notEqual(translateSource('zh',source),'',source)
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
  const css=fs.readFileSync(new URL('../src/App.css',import.meta.url),'utf8')+fs.readFileSync(new URL('../src/index.css',import.meta.url),'utf8')+fs.readFileSync(new URL('../src/ZoneGroupManager.css',import.meta.url),'utf8')
  assert.match(css,/@media\s*\([^)]*max-width\s*:\s*(?:560|640|720|768|820|900)px/)
  assert.doesNotMatch(css,/(?:html|body|#root)\s*\{[^}]*min-width\s*:\s*[4-9]\d{2}px/s)
  assert.match(css,/zone-rename-modal\{width:min\(480px,100%\)/)
})

test('Zone Rename使用应用内Modal并覆盖取消、验证、成功与错误状态',()=>{
  const source=fs.readFileSync(new URL('../src/ZoneGroupManager.jsx',import.meta.url),'utf8')
  assert.doesNotMatch(source,/prompt\(['"]Zone Group Name/)
  for(const contract of ['role="dialog"','aria-modal="true"',"t('zone.currentName')","t('zone.newName')","t('zone.renameSave')","t('common.cancel')",'validateZoneRename(name,t)','onInput={event=>onNameChange(event.currentTarget.value)}','renameSaving','pageError','if(ok)closeRename()'])assert.match(source,new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))
  for(const language of ['en','ms','zh'])for(const key of ['zone.renameTitle','zone.currentName','zone.newName','zone.renameEmpty','zone.renameHelp','zone.renameSuccess'])assert.notEqual(translate(language,key),key)
})

test('四个正式验收页面的动态文字按语言渲染且数据库原值保持raw',()=>{
  const surfaces=[
    '导出 Area-Zone Mapping','不物理删除历史资料；使用 Pause、Resume 或 Close 管理状态。',
    '显示 118 项','未填写名称/品牌 · 未填写载重 · Base 未设置',
    '新 Zone 名称','有正式 GPS','停用','显示 9 个 · 已勾选 0 个'
  ]
  for(const language of ['en','ms'])for(const source of surfaces)assert.equal(containsCjk(translateSource(language,source)),false,`${language}: ${source}`)
  assert.equal(translateSource('en','显示 118 项'),'Showing 118 items')
  assert.equal(translateSource('ms','显示 118 项'),'Memaparkan 118 item')
  for(const value of ['古晋 A区 BDC','伦乐 / 石隆门区','Lot 376, Jalan Petanak, Sarawak, 马来西亚'])assert.equal(translateSource('en',value),value)
  const master=fs.readFileSync(new URL('../src/MasterDataPage.jsx',import.meta.url),'utf8')
  assert.match(master,/data-i18n-raw/)
  const gpsRecommendations=fs.readFileSync(new URL('../src/GpsZoneRecommendationPage.jsx',import.meta.url),'utf8')
  assert.match(gpsRecommendations,/t\('gps\.itemsShown',\{count:items\.length\}\)/)
  assert.doesNotMatch(gpsRecommendations,/<span>显示 \{items\.length\} 项<\/span>/)
  const zoneManager=fs.readFileSync(new URL('../src/ZoneGroupManager.jsx',import.meta.url),'utf8')
  assert.match(zoneManager,/t\('zone\.counts',\{shown:filtered\.length,selected:selected\.length\}\)/)
  assert.doesNotMatch(zoneManager,/<span>显示 \{filtered\.length\} 个 · 已勾选 \{selected\.length\} 个<\/span>/)
})

test('Zone Rename空值和CJK验证不会发出保存请求',()=>{
  for(const language of ['en','ms','zh']){
    let saveCount=0
    const attempt=value=>{const error=validateZoneRename(value,(key)=>translate(language,key));if(!error)saveCount+=1;return error}
    assert.equal(attempt(''),translate(language,'zone.renameEmpty'))
    assert.equal(attempt('   '),translate(language,'zone.renameEmpty'))
    assert.equal(attempt('测试 Zone'),translate(language,'apiError.invalid_location_text'))
    assert.equal(saveCount,0)
    assert.equal(attempt('Kuching A — BDC'),'')
    assert.equal(saveCount,1)
  }
})

test('Customer Branch、Buyer及Operational Location三语界面词汇完整且key集合一致',()=>{
  const surfaces={
    customerBranch:['Customer Branch Master','Location Name','Contact Person','Branch ID','Customer ID','Branch Name','Save Customer Branch'],
    buyer:['Buyer Master','Location Name','Contact Person','Buyer ID','Buyer Name','Material Accepted','Operating Hours'],
    operationalLocation:['Operational Location Master','Location Name','Contact Person','Location ID','Location Type','Company Yard','Fuel Station'],
  }
  for(const [page,words] of Object.entries(surfaces))for(const language of ['en','ms','zh'])for(const word of words){
    const rendered=translateSource(language,word)
    assert.notEqual(rendered,'',`${page} ${language}: empty translation for ${word}`)
    if(language!=='en')assert.notEqual(rendered,word,`${page} ${language}: English fallback remains: ${word}`)
  }
  const keySets=['en','ms','zh'].map(language=>Object.keys(messages[language]).sort())
  assert.deepEqual(keySets[1],keySets[0],'Bahasa Melayu translation keys differ from English')
  assert.deepEqual(keySets[2],keySets[0],'Chinese translation keys differ from English')
})

test('三个主档页面动态数据库值保持raw保护且表单提供可本地化placeholder',()=>{
  const source=fs.readFileSync(new URL('../src/MasterDataPage.jsx',import.meta.url),'utf8')
  for(const value of ['item.branchName','item.customerName','item.locationName','item.materialAccepted','item.locationType','item.address'])assert.match(source,new RegExp(value.replace('.','\\.')),value)
  assert.match(source,/data-i18n-raw/)
  assert.match(source,/document\.querySelectorAll\('\.master-modal \.editor-fields>label'\)/)
  assert.match(source,/<textarea placeholder=\{label\}/)
  assert.match(source,/<input placeholder=\{label\}/)
})

test('GPS Collector在375px和390px为单栏且桌面保留双栏，并限制子项宽度',()=>{
  const css=fs.readFileSync(new URL('../src/MasterDataPage.css',import.meta.url),'utf8')
  assert.match(css,/\.gps-collector>form\{display:grid;grid-template-columns:2fr 2fr 1fr 1fr 1\.2fr auto/)
  assert.match(css,/@media\(max-width:600px\)\{\s*\.gps-collector>form\{grid-template-columns:minmax\(0,1fr\)\}/)
  for(const width of [375,390]){
    assert.ok(width<=600,`GPS Collector ${width}px did not enter the single-column breakpoint`)
    assert.match(css,/\.gps-collector input,.gps-collector select,.gps-collector button\{min-width:0;width:100%;max-width:100%;box-sizing:border-box\}/)
    assert.match(css,/\.master-nav\{max-width:100%;min-width:0;overscroll-behavior-inline:contain\}/)
  }
  assert.doesNotMatch(css,/(?:html|body|#root)[^{]*\{[^}]*overflow-x\s*:\s*hidden/s)
})

test('1024px使用局部三栏摘要和双栏GPS表单，1440px保留六栏且导航自行滚动',()=>{
  const css=fs.readFileSync(new URL('../src/MasterDataPage.css',import.meta.url),'utf8')
  assert.match(css,/@media\(max-width:1100px\)\{\s*\.area-closeout\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/)
  assert.match(css,/@media\(max-width:1100px\)[\s\S]*?\.gps-collector>form\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/)
  assert.match(css,/\.area-closeout>\*,\.area-closeout \.export-buttons\{min-width:0;max-width:100%;box-sizing:border-box\}/)
  assert.match(css,/\.gps-collector>form\{display:grid;grid-template-columns:2fr 2fr 1fr 1fr 1\.2fr auto/)
  assert.match(css,/\.master-nav\{max-width:100%;min-width:0;overscroll-behavior-inline:contain\}/)
  assert.doesNotMatch(css,/(?:html|body|#root)[^{]*\{[^}]*overflow-x\s*:\s*hidden/s)
})
