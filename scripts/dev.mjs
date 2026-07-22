import { execFileSync, spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const viteEntry = path.join(projectDir, 'node_modules', 'vite', 'bin', 'vite.js')
const viteArgs = process.argv.slice(2)

const pause=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds))

async function isKcsService(port) {
  try {
    if(port===8787){const response=await fetch(`http://127.0.0.1:${port}/api/health`);return response.ok&&(await response.json()).service==='kcs-api'}
    const response=await fetch(`http://127.0.0.1:${port}/`)
    return response.ok&&(await response.text()).includes('KCS Dispatch System')
  } catch { return false }
}

function listeningPids(port) {
  if(process.platform!=='win32')return []
  try {
    const output=execFileSync('netstat',['-ano','-p','tcp'],{encoding:'utf8',windowsHide:true})
    return [...new Set(output.split(/\r?\n/).map(line=>line.match(/^\s*TCP\s+\S+:([0-9]+)\s+\S+\s+LISTENING\s+([0-9]+)\s*$/i)).filter(match=>match&&Number(match[1])===port).map(match=>Number(match[2])))]
  } catch { return [] }
}

async function stopOldKcsPort(port,label) {
  if(!(await isKcsService(port)))return
  const pids=listeningPids(port)
  for(const pid of pids){
    console.log(`Stopping old KCS ${label} process on port ${port} (PID ${pid})...`)
    try{execFileSync('taskkill',['/PID',String(pid),'/T','/F'],{stdio:'ignore',windowsHide:true})}catch{throw new Error(`Unable to stop old KCS ${label} process (PID ${pid}). Close its old command window and try again.`)}
  }
  if(pids.length)await pause(400)
}

// Stop the web process first while its identity page is still reachable, then the API.
// An unrelated process is never killed merely because it uses one of these ports.
await stopOldKcsPort(5175,'web')
await stopOldKcsPort(8787,'API')

let stopping = false
let vite = null
const api = spawn(process.execPath, [path.join(projectDir, 'server', 'index.mjs')], { cwd: projectDir, stdio: 'inherit' })
let apiExitCode = null
api.on('exit',code=>{apiExitCode=code??0;if(!stopping)stop(apiExitCode||1)})

async function waitForApi() {
  for(let attempt=0;attempt<60;attempt+=1){
    if(apiExitCode!==null)throw new Error(`KCS API stopped during startup (exit ${apiExitCode}).`)
    try{const response=await fetch('http://127.0.0.1:8787/api/health');if(response.ok&&(await response.json()).service==='kcs-api')return}catch{}
    await pause(100)
  }
  throw new Error('KCS API did not become ready on port 8787.')
}

function stop(code = 0) {
  if (stopping) return
  stopping = true
  if (!api.killed) api.kill('SIGTERM')
  if (vite && !vite.killed) vite.kill('SIGTERM')
  setTimeout(() => process.exit(code), 250)
}

try{
  await waitForApi()
  vite = spawn(process.execPath, [viteEntry, ...viteArgs], { cwd: projectDir, stdio: 'inherit' })
  vite.on('exit', code => stop(code ?? 0))
}catch(error){
  console.error(error.message)
  stop(1)
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
