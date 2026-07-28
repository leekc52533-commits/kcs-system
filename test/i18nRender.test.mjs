import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
import {readdirSync,readFileSync} from 'node:fs'
import {dirname,join,relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {translate} from '../src/translations.js'

const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/'})
globalThis.window=dom.window
globalThis.document=dom.window.document
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
globalThis.Node=dom.window.Node
globalThis.NodeFilter=dom.window.NodeFilter
globalThis.HTMLElement=dom.window.HTMLElement
globalThis.requestAnimationFrame=callback=>setTimeout(callback,0)
globalThis.cancelAnimationFrame=id=>clearTimeout(id)

const vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())

const [{I18nProvider},masterModule,resourceModule]=await Promise.all([
  vite.ssrLoadModule('/src/i18n.jsx'),
  vite.ssrLoadModule('/src/MasterDataPage.jsx'),
  vite.ssrLoadModule('/src/ResourcePage.jsx'),
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
    assert.match(customer,new RegExp(translate(language,'customer.noPayment')))
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

test('车辆与Operational Location实际主档组件在English与BM不显示CJK界面文字',()=>{
  for(const language of ['en','ms']){
    const vehicle=renderMasterSurface(language,'Vehicle Master loaded state',React.createElement(resourceModule.VehicleMaster,{
      items:[{id:1,vehicleCode:'Lorry 1',registrationNumber:null,vehicleName:null,brand:null,capacityKg:null,defaultBase:null,preferredZones:[],preferredAreaIds:[],status:'available',isTemporary:false,defaultBaseLocationId:null}],
      locations:[],areas:[],form:{vehicleCode:'',vehicleName:'',registrationNumber:'',capacityKg:'',defaultBaseLocationId:'',preferredAreaIds:[]},
      setForm:noop,add:noop,save:noop,edit:noop,openDetail:noop,
    }))
    assert.match(htmlText(vehicle),new RegExp(translate(language,'vehicle.missingNameBrand').replace('/','\\/')))
    assert.match(htmlText(vehicle),new RegExp(translate(language,'vehicle.missingCapacity')))

    const location=renderMasterSurface(language,'Operational Location loaded state',React.createElement(resourceModule.LocationMaster,{
      items:[],form:{name:'',locationType:'depot',address:'',canStart:true,canEnd:true},setForm:noop,add:noop,save:noop,edit:noop,
    }))
    assert.match(htmlText(location),new RegExp(translate(language,'master.operationalLocation')))
  }
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
