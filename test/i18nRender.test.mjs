import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createRoot} from 'react-dom/client'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
import {readdirSync,readFileSync} from 'node:fs'
import {dirname,join,relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {translate,translateSource} from '../src/translations.js'

const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/'})
globalThis.window=dom.window
globalThis.document=dom.window.document
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
globalThis.Node=dom.window.Node
globalThis.NodeFilter=dom.window.NodeFilter
globalThis.HTMLElement=dom.window.HTMLElement
globalThis.MutationObserver=dom.window.MutationObserver
globalThis.IS_REACT_ACT_ENVIRONMENT=true
globalThis.requestAnimationFrame=callback=>setTimeout(callback,0)
globalThis.cancelAnimationFrame=id=>clearTimeout(id)

const vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())

const [{I18nProvider},masterModule,resourceModule,backModule]=await Promise.all([
  vite.ssrLoadModule('/src/i18n.jsx'),
  vite.ssrLoadModule('/src/MasterDataPage.jsx'),
  vite.ssrLoadModule('/src/ResourcePage.jsx'),
  vite.ssrLoadModule('/src/BackButton.jsx'),
])

const noop=()=>{}
const actor={changedBy:'Render Test',actorRole:'admin',canManagePricing:true}
const currentUser={name:'Render Test',role:'admin',systemRole:'owner_admin',permissions:[]}
const wrap=(language,element)=>renderToStaticMarkup(React.createElement(I18nProvider,{language,setLanguage:noop},element))
const htmlText=html=>html.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#x27;',"'")
const withoutRaw=html=>html.replace(/<([a-z][\w-]*)\b[^>]*data-i18n-raw(?:="[^"]*")?[^>]*>[\s\S]*?<\/\1>/gi,'')
const assertNoCjk=(page,language,html)=>{
  const visible=withoutRaw(html),matches=[...visible.matchAll(/[\p{Script=Han}]/gu)]
  if(matches.length){
    const samples=[...new Set(matches.slice(0,12).map(match=>visible.slice(Math.max(0,match.index-28),match.index+55).replace(/<[^>]+>/g,' ')))]
    assert.fail(`${language} ${page} contains CJK UI text:\n${samples.join('\n')}`)
  }
}

const projectRoot=join(dirname(fileURLToPath(import.meta.url)),'..')
const sourceFiles=directory=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const full=join(directory,entry.name)
  return entry.isDirectory()?sourceFiles(full):/\.(?:js|jsx)$/u.test(entry.name)?[full]:[]
})

test('生产源码只允许翻译资源包含CJK，并按文件与行号报告残留',()=>{
  const violations=[]
  for(const file of sourceFiles(join(projectRoot,'src'))){
    if(file.endsWith(`${join('src','translations.js')}`))continue
    readFileSync(file,'utf8').split(/\r?\n/u).forEach((line,index)=>{
      if(/[\p{Script=Han}]/u.test(line))violations.push(`${relative(projectRoot,file)}:${index+1}: ${line.trim()}`)
    })
  }
  assert.equal(violations.length,0,`Hard-coded CJK remains in production source:\n${violations.join('\n')}`)
})

function renderMasterSurface(language,name,element){
  const html=wrap(language,element)
  assertNoCjk(name,language,html)
  return html
}

test('Customer Branch、GPS Collector、Buyer、Operational Location及Import/Export实际组件在English与BM不显示CJK界面文字',()=>{
  for(const language of ['en','ms']){
    const customer=renderMasterSurface(language,'Customer Branch Master',React.createElement(masterModule.EntityManager,{
      type:'branch',endpoint:'/api/master/branches',fields:[],reload:noop,notify:noop,fail:noop,actor,
      initialLoading:false,initialItems:[{branchId:'B-1',branchName:'Branch Test',customerName:'Customer Test',area:null,paymentType:null,materialCount:0,status:'active',notes:null}],
    }))
    assert.match(customer,new RegExp(translate(language,'list.payment')))
    assert.doesNotMatch(customer,new RegExp(translate(language,'customer.noPayment')))
    assert.match(customer,/data-i18n-raw/)

    const buyer=renderMasterSurface(language,'Buyer Master',React.createElement(masterModule.EntityManager,{
      type:'buyer',endpoint:'/api/buyers',fields:[],reload:noop,notify:noop,fail:noop,actor,initialLoading:false,initialItems:[],
    }))
    assert.match(buyer,new RegExp(translate(language,'master.addEntity',{entity:translate(language,'master.buyer')})))

    const location=renderMasterSurface(language,'Operational Location',React.createElement(masterModule.EntityManager,{
      type:'operational_location',endpoint:'/api/operational-locations',fields:[],reload:noop,notify:noop,fail:noop,actor,initialLoading:false,initialItems:[],
    }))
    assert.match(location,new RegExp(translate(language,'master.addEntity',{entity:translate(language,'master.operationalLocation')})))

    const gps=renderMasterSurface(language,'GPS Collector',React.createElement(masterModule.GpsCollector,{reload:0,refresh:noop,notify:noop,fail:noop,actor}))
    for(const key of ['gps.collectorHelp','gps.searchCustomerBranch','gps.customerBranchPlaceholder','gps.selectBranch','gps.pleaseSelect','gps.source','gps.saveTemporary'])assert.match(htmlText(gps),new RegExp(translate(language,key).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))

    const transfer=renderMasterSurface(language,'Excel / CSV Import & Export',React.createElement(masterModule.TransferPanel,{notify:noop,fail:noop,actor}))
    for(const key of ['transfer.title','transfer.help','transfer.module','transfer.csvTemplate','transfer.exportAll','transfer.chooseFile','transfer.preview','transfer.recent','transfer.noLogs'])assert.match(htmlText(transfer),new RegExp(translate(language,key).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))
  }
})

test('数据库动态原值明确标记为raw且不参与CJK界面断言',()=>{
  const html=wrap('ms',React.createElement(masterModule.EntityManager,{
    type:'branch',endpoint:'/api/master/branches',fields:[],reload:noop,notify:noop,fail:noop,actor,
    initialLoading:false,initialItems:[{branchId:'B-CJK',branchName:'动态中文分店',customerName:'动态中文客户',area:'动态中文区域',paymentType:null,materialCount:0,status:'active',notes:'动态中文备注'}],
  }))
  assert.match(html,/data-i18n-raw/)
  assert.doesNotThrow(()=>assertNoCjk('dynamic database values','ms',html))
})

test('Buyer、Operational Location及Customer Branch三语实际Modal包含本地化标题、字段、placeholder及按钮',()=>{
  const specs=[
    ['Buyer Master','master.buyer',masterModule.buyerFields,{buyerId:'',buyerName:'',status:'active'}],
    ['Operational Location','master.operationalLocation',masterModule.locationFields,{locationId:'',name:'',status:'active'}],
    ['Customer Branch','master.branch',masterModule.branchFields,{branchId:'',customerId:'',branchName:'',status:'active'}],
  ]
  for(const [page,entityKey,fields,initial] of specs)for(const language of ['en','ms','zh']){
    const title=translate(language,'master.addEntity',{entity:translate(language,entityKey)})
    const html=htmlText(wrap(language,React.createElement(masterModule.Editor,{title,fields,initial,lockId:false,onClose:noop,onSave:noop})))
    assert.match(html,new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),`${page} ${language}: modal title`)
    for(const source of ['Location Name','Contact Person']){
      if(!fields.some(([,label])=>label===source))continue
      const localized=translateSource(language,source)
      assert.notEqual(localized,'',`${page} ${language}: ${source}`)
      if(language!=='en')assert.notEqual(localized,source,`${page} ${language}: English fallback ${source}`)
      assert.match(html,new RegExp(`placeholder="${source}"`),`${page} ${language}: placeholder source contract ${source}`)
    }
    for(const key of ['common.cancel','common.save'])assert.match(html,new RegExp(translate(language,key)),`${page} ${language}: ${key}`)
  }
})

test('Buyer与Operational Location明确区分loading、API错误及三语零资料状态',()=>{
  const specs=[
    ['buyer','/api/buyers','master.noBuyers'],
    ['operational_location','/api/operational-locations','master.noOperationalLocations'],
  ]
  for(const [type,endpoint,emptyKey] of specs)for(const language of ['en','ms','zh']){
    const fields=type==='buyer'?masterModule.buyerFields:masterModule.locationFields
    const base={type,endpoint,fields,reload:noop,notify:noop,fail:noop,actor,initialItems:[]}
    const empty=htmlText(wrap(language,React.createElement(masterModule.EntityManager,{...base,initialLoading:false})))
    assert.match(empty,new RegExp(translate(language,emptyKey)),`${type} ${language}: empty state`)
    const loading=htmlText(wrap(language,React.createElement(masterModule.EntityManager,{...base,initialLoading:true})))
    assert.match(loading,new RegExp(translate(language,'common.loadingData')),`${type} ${language}: loading state`)
    assert.doesNotMatch(loading,new RegExp(translate(language,emptyKey)),`${type} ${language}: empty shown while loading`)
    const failed=htmlText(wrap(language,React.createElement(masterModule.EntityManager,{...base,initialLoading:false,initialLoadFailed:true})))
    assert.doesNotMatch(failed,new RegExp(translate(language,emptyKey)),`${type} ${language}: empty shown after API error`)
    assert.doesNotMatch(failed,new RegExp(translate(language,'common.loadingData')),`${type} ${language}: loading shown after API error`)
  }
})

test('Operational Location坐标及GPS Collector来源选项三语显示正确且内部value稳定',()=>{
  const sourceValues=['Driver Captured','Customer WhatsApp','Customer Phone','Manual Entry','Supervisor Confirmed']
  const sourceKeys=['gps.source.driverCaptured','gps.source.customerWhatsApp','gps.source.customerPhone','gps.source.manualEntry','gps.source.supervisorConfirmed']
  for(const language of ['en','ms','zh']){
    for(const [source,key] of [['Latitude','master.latitude'],['Longitude','master.longitude']]){
      const localized=translateSource(language,source)
      assert.equal(localized,translate(language,key),`Operational Location ${language}: ${source}`)
      if(language!=='en')assert.notEqual(localized,source,`Operational Location ${language}: English fallback ${source}`)
    }
    const gps=htmlText(wrap(language,React.createElement(masterModule.GpsCollector,{reload:0,refresh:noop,notify:noop,fail:noop,actor})))
    for(const key of ['gps.latitude','gps.longitude','gps.latitudePlaceholder','gps.longitudePlaceholder',...sourceKeys])assert.match(gps,new RegExp(translate(language,key).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),`GPS Collector ${language}: ${key}`)
    sourceValues.forEach((value,index)=>{
      assert.match(gps,new RegExp(`value="${value}"[^>]*>${translate(language,sourceKeys[index]).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}</option>`),`GPS Collector ${language}: stable value ${value}`)
      if(language!=='en')assert.notEqual(translate(language,sourceKeys[index]),value,`GPS Collector ${language}: English source fallback ${value}`)
    })
  }
})

test('车辆与Operational Location实际主档组件在English与BM不显示CJK界面文字',()=>{
  for(const language of ['en','ms']){
    const vehicle=renderMasterSurface(language,'Vehicle Master loaded state',React.createElement(resourceModule.VehicleMaster,{
      items:[{id:1,vehicleCode:'Lorry 1',registrationNumber:null,vehicleName:null,brand:null,model:null,capacityKg:null,defaultBase:null,preferredZones:[],preferredAreaIds:[],status:'available',isTemporary:false,defaultBaseLocationId:null},{id:2,vehicleCode:'Former Vehicle',registrationNumber:'QTW2704',vehicleName:null,brand:null,model:null,capacityKg:null,defaultBase:null,preferredZones:[],preferredAreaIds:[],status:'sold',isTemporary:false,defaultBaseLocationId:null}],
      locations:[],areas:[],form:{vehicleCode:'',vehicleName:'',registrationNumber:'',capacityKg:'',defaultBaseLocationId:'',preferredAreaIds:[]},
      setForm:noop,add:noop,save:noop,edit:noop,openDetail:noop,
    }))
    assert.match(htmlText(vehicle),new RegExp(translate(language,'vehicle.missingNameBrand').replace('/','\\/')))
    assert.match(htmlText(vehicle),new RegExp(translate(language,'common.notSet')))
    assert.match(htmlText(vehicle),new RegExp(translate(language,'vehicle.add')))
    assert.doesNotMatch(vehicle,/placeholder="Registration Number \/ Plate"/)
    assert.doesNotMatch(htmlText(vehicle),new RegExp(translate(language,'vehicle.viewDetail')))
    assert.doesNotMatch(htmlText(vehicle),new RegExp(translate(language,'vehicle.quickEdit')))
    assert.match(vehicle,/vehicle-master-card sold-vehicle/)
    assert.doesNotMatch(vehicle,/<select aria-label="Lorry 1 status"/)

    const location=renderMasterSurface(language,'Operational Location loaded state',React.createElement(resourceModule.LocationMaster,{
      items:[],form:{name:'',locationType:'depot',address:'',canStart:true,canEnd:true},setForm:noop,add:noop,save:noop,edit:noop,
    }))
    assert.match(htmlText(location),new RegExp(translate(language,'master.operationalLocation')))
  }
})

test('Vehicle导航、折叠新增表单、可点击清单与Sold历史状态保持明确',()=>{
  const resource=readFileSync(join(projectRoot,'src','ResourcePage.jsx'),'utf8')
  const app=readFileSync(join(projectRoot,'src','App.jsx'),'utf8')
  const detail=readFileSync(join(projectRoot,'src','VehicleDetailPage.jsx'),'utf8')
  assert.match(resource,/\[showAdd,setShowAdd\]=useState\(false\)/)
  assert.match(resource,/showAdd&&<form className="vehicle-create-form"/)
  assert.match(resource,/role="button" tabIndex="0"/)
  assert.match(resource,/vehicle-list-status/)
  assert.match(resource,/sold-vehicle/)
  assert.match(app,/page!==['"]vehicles['"]&&<BackButton/)
  assert.match(detail,/className="vehicle-back" onClick=\{onBack\}>Back<\/button>/)
  assert.match(detail,/readOnly=\{!isOwnerAdmin\}/)
})

test('Vehicle Master显示单一白色Back并调用现有上一页导航',async()=>{
  const source=readFileSync(join(projectRoot,'src','ResourcePage.jsx'),'utf8'),css=readFileSync(join(projectRoot,'src','VehicleDetailPage.css'),'utf8')
  assert.match(source,/<BackButton className="vehicle-back" fallback=\{\(\)=>window\.history\.back\(\)\}\/>/)
  assert.match(css,/\.vehicle-back\{[^}]*width:max-content/)
  const container=document.createElement('div'),root=createRoot(container),originalBack=window.history.back
  let calls=0
  window.history.replaceState({kcsPage:'vehicles'},'',window.location.href)
  window.history.back=()=>{calls++}
  await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh',setLanguage:noop},React.createElement(backModule.default,{className:'vehicle-back',fallback:()=>window.history.back()}))))
  container.querySelector('button').click()
  assert.equal(calls,1)
  assert.equal(container.querySelectorAll('button.vehicle-back').length,1)
  await act(async()=>root.unmount())
  window.history.back=originalBack
})

test('当前生产路由初始组件在English与BM渲染时报告具体页面残留',async()=>{
  const routeSpecs=[
    ['Jodoo Data Sync','/src/ImportPage.jsx','default',{onBack:noop}],
    ['Weekly Dispatch','/src/WeeklyDispatchPage.jsx','default',{onOpenSpecial:noop,currentUser}],
    ['Special Collection Requests','/src/SpecialRequestsPage.jsx','default',{onOpenPlanner:noop,currentUser}],
    ['Customers & Locations','/src/MasterDataPage.jsx','default',{currentUser}],
    ['Collection Schedules','/src/DataPages.jsx','SchedulesPage',{}],
    ['GPS & Data Quality','/src/DataPages.jsx','DataQualityPage',{}],
    ['GPS Zone Recommendations','/src/GpsZoneRecommendationPage.jsx','default',{currentUser}],
    ['Employees Vehicles Locations Zones','/src/ResourcePage.jsx','default',{currentUser}],
    ['Account Management','/src/AccountManagementPage.jsx','default',{account:{role:'owner_admin'}}],
    ['Legacy GPS Migration','/src/GpsMigrationPage.jsx','default',{}],
  ]
  for(const [page,path,exportName,props] of routeSpecs){
    const module=await vite.ssrLoadModule(path),Component=module[exportName]
    for(const language of ['en','ms'])assertNoCjk(page,language,wrap(language,React.createElement(Component,props)))
  }
})

test('Branch detail stays compact and does not duplicate inherited Customer pricing',()=>{
  const item={branchId:'12',branchName:'Branch',customerId:'7',customerName:'Customer',materials:[{materialId:1,materialName:'OCC',priceType:'outstation',currentPrice:.44,resolutionState:'ready'}]}
  const html=htmlText(wrap('en',React.createElement(masterModule.BranchReadOnlyDetail||(()=>null),{item,onClose:noop})))
  const source=readFileSync(new URL('../src/BranchEditor.jsx',import.meta.url),'utf8')
  assert.match(html,/C7/)
  assert.doesNotMatch(html,/Inherited Customer Materials/)
  assert.doesNotMatch(html,/RM0\.44\/kg/)
  assert.doesNotMatch(source,/className="branch-materials inherited-pricing"/)
  assert.doesNotMatch(source,/customerPricing/)
  assert.doesNotMatch(html,/form\.customerId/)
})

test('Customer pricing changed-flow labels render completely in English, Malay and Chinese',()=>{
  for(const language of ['en','ms','zh']){
    const html=htmlText(wrap(language,React.createElement(masterModule.CustomerEditor,{initial:{customerId:'7',customerName:'Customer',status:'active',materialPricing:[]},lockId:true,onClose:noop,onSave:noop,fail:noop,canManagePricing:true,saving:false})))
    assert.match(html,new RegExp(translate(language,'customer.materialPricing')))
    assert.match(html,new RegExp(translate(language,'customer.noPricing')))
    assert.match(html,new RegExp(translate(language,'customer.save')))
    assert.doesNotMatch(html,/Not Not set/)
  }
})

test('legacy OCC archive hides unused groups by default and retains localized Branch history',async()=>{
  const{LegacyOccArchive}=await vite.ssrLoadModule('/src/MaterialsPricesPage.jsx'),data={legacyReadOnly:true,items:[{id:7,itemCode:'OCC-020',priceAmount:.2,branchCount:1,status:'active',branches:[{branchInternalId:9,customerCode:'C001',customerName:'Archive Customer',branchName:'Archive Branch',areaName:'North'}]},{id:8,itemCode:'OCC-021',priceAmount:.21,branchCount:0,status:'active',branches:[]}]}
  for(const language of ['en','ms','zh']){
    const html=htmlText(wrap(language,React.createElement(LegacyOccArchive,{data,onBack:noop})))
    assert.match(html,new RegExp(translate(language,'occLegacy.readOnly')))
    assert.match(html,new RegExp(translate(language,'occLegacy.openCustomers')))
    assert.match(html,new RegExp(translate(language,'occLegacy.showUnused')))
    assert.match(html,/OCC-020/)
    assert.doesNotMatch(html,/OCC-021|Add OCC Price Group|Save Price Change|Preview Move|Confirm Move|<form/)
  }
  const container=document.createElement('div'),root=createRoot(container)
  await act(async()=>root.render(React.createElement(I18nProvider,{language:'en',setLanguage:noop},React.createElement(LegacyOccArchive,{data,onBack:noop}))))
  assert.doesNotMatch(container.textContent,/OCC-021/)
  await act(async()=>container.querySelector('input[type="checkbox"]').click())
  assert.match(container.textContent,/OCC-021/)
  await act(async()=>container.querySelector('article[role="button"]').click())
  assert.match(container.textContent,/Archive Customer/)
  assert.match(container.textContent,/Archive Branch/)
  assert.match(container.textContent,/Historical Price/)
  assert.equal(container.querySelectorAll('input,select,textarea,form').length,0)
  await act(async()=>root.unmount())
})
