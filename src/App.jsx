import { useEffect, useState } from 'react'
import './App.css'
import ImportPage from './ImportPage.jsx'
import DispatchPage from './DispatchPage.jsx'

const navigation = [
  ['dashboard', '⌂', '总览'], ['dispatch', '↗', '每日派车'],
  ['customers', '◎', '客户与分店'], ['schedule', '◷', '收货排程'],
  ['data', '⌖', 'GPS 与资料'], ['resources', '◇', '员工、车辆与地点'],
  ['sync', '↻', 'Jodoo 资料同步'],
]

const modules = [
  ['dispatch','↗','今日派车','筛选今天需要收货的客户，并安排车辆、员工和路线。','建立派车单','green'],
  ['customers','◎','客户与分店','管理客户、分店、地址、付款方式和收购价格。','查看客户资料','blue'],
  ['schedule','◷','收货排程','维护收货星期、频率、下一次收货日期和暂停状态。','管理排程','orange'],
  ['data','⌖','GPS 与资料完整度','追踪缺少 GPS、排程或其他关键资料的分店。','检查资料','violet'],
  ['resources','◇','员工、车辆与地点','分别管理员工、车辆以及可调整的出发与结束地点。','管理资源','cyan'],
  ['sync','↻','Jodoo 资料同步','导入最新 Excel，并预览新增、修改、重复和异常资料。','准备导入','rose'],
]

function App() {
  const [page, setPage] = useState('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [systemStatus, setSystemStatus] = useState({ connected: false, label: '后台连接中…' })
  useEffect(() => {
    let active = true
    fetch('/api/system/status')
      .then((response) => { if (!response.ok) throw new Error('API unavailable'); return response.json() })
      .then((status) => { if (active) setSystemStatus({ connected: status.database === 'connected', label: `数据库 v${status.schemaVersion} · Jodoo ${status.integrations?.jodoo?.configured ? '已配置' : '等待配置'}` }) })
      .catch(() => { if (active) setSystemStatus({ connected: false, label: '后台未连接，请重新启动系统' }) })
    return () => { active = false }
  }, [])
  const go = (id) => { setPage(id); setMenuOpen(false) }
  const title = navigation.find((item) => item[0] === page)?.[2]

  return <div className="shell">
    <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
      <div className="brand"><b>K</b><div><strong>KCS Dispatch</strong><span>LEE SAI KER ENTERPRISE</span></div></div>
      <nav><small>工作台</small>{navigation.map((item) =>
        <button type="button" key={item[0]} className={page === item[0] ? 'active' : ''} onClick={() => go(item[0])}>
          <i>{item[1]}</i>{item[2]}
        </button>)}</nav>
      <footer><div><i className={systemStatus.connected ? '' : 'offline'}/><span><strong>{systemStatus.connected ? '系统运行中' : '系统等待后台'}</strong><small>{systemStatus.label}</small></span></div><p>诚信守时 · 服务至上</p></footer>
    </aside>
    {menuOpen && <button type="button" className="shade" aria-label="关闭菜单" onClick={() => setMenuOpen(false)}/>} 
    <main>
      <header className="topbar"><button type="button" className="menu" aria-label="打开菜单" onClick={() => setMenuOpen(true)}>☰</button><div><small>KCS DISPATCH SYSTEM</small><strong>{title}</strong></div><span>2026年7月18日 · 星期六</span><b>LSK</b></header>
      {page === 'dashboard' ? <Dashboard go={go}/> : page === 'sync' ? <ImportPage onBack={() => go('dashboard')}/> : page === 'dispatch' ? <DispatchPage onBack={() => go('dashboard')}/> : <Placeholder page={page} go={go}/>} 
    </main>
  </div>
}

function Dashboard({ go }) {
  const stats = [['475','客户分店','目前主档总数','blue'],['267','已有排程','56% 已安排','green'],['118','已有 GPS','持续收集中','violet'],['106','可测试路线','排程与 GPS 齐全','orange']]
  const issues = [['159','已有排程，但缺少 GPS','需跟进'],['210','尚未安排收货排程','待安排'],['2','排程 Branch ID 无法匹配','需核对']]
  return <div className="page">
    <section className="welcome"><div><em>运营总览</em><h1>早安，今天从这里开始。</h1><p>查看资料准备情况，并进入下一步的派车与路线规划工作。</p></div><button type="button" onClick={() => go('dispatch')}>＋ 建立今日派车</button></section>
    <section className="stats" aria-label="资料概览">{stats.map((s) => <article className={s[3]} key={s[1]}><span>{s[1]}</span><strong>{s[0]}</strong><small>{s[2]}</small></article>)}</section>
    <section className="layout"><div><Heading label="主要功能" title="系统模块" badge="第一阶段骨架"/><div className="cards">{modules.map((m) => <button type="button" className="card" key={m[0]} onClick={() => go(m[0])}><i className={m[5]}>{m[1]}</i><span><strong>{m[2]}</strong><small>{m[3]}</small><b>{m[4]} →</b></span></button>)}</div></div>
      <aside className="data"><Heading label="资料状态" title="需要处理" action={() => go('data')}/><div className="progress"><span><b>可用于路线测试</b><strong>106 / 475</strong></span><div><i/></div><small>分店同时具备排程及 GPS</small></div><div className="issues">{issues.map((x) => <button type="button" key={x[1]} onClick={() => go('data')}><strong>{x[0]}</strong><span>{x[1]}<small>{x[2]}</small></span><b>›</b></button>)}</div><div className="note"><b>↻</b><span><strong>下一步：导入最新 Jodoo Excel</strong><small>系统将先预览变化，不会直接覆盖资料。</small></span></div></aside>
    </section>
  </div>
}

function Heading({ label, title, badge, action }) { return <div className="heading"><div><em>{label}</em><h2>{title}</h2></div>{badge && <small>{badge}</small>}{action && <button type="button" onClick={action}>查看全部</button>}</div> }
function Placeholder({ page, go }) { const m = modules.find((item) => item[0] === page); return <div className="page placeholder"><button type="button" onClick={() => go('dashboard')}>← 返回总览</button><section><i className={m[5]}>{m[1]}</i><em>第一阶段 · 模块入口</em><h1>{m[2]}</h1><p>{m[3]}</p><small>页面结构已预留 · 业务功能将在后续阶段接入</small></section></div> }

export default App
