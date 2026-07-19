import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const viteEntry = path.join(projectDir, 'node_modules', 'vite', 'bin', 'vite.js')
const viteArgs = process.argv.slice(2)
const api = spawn(process.execPath, [path.join(projectDir, 'server', 'index.mjs')], { cwd: projectDir, stdio: 'inherit' })
const vite = spawn(process.execPath, [viteEntry, ...viteArgs], { cwd: projectDir, stdio: 'inherit' })
let stopping = false

function stop(code = 0) {
  if (stopping) return
  stopping = true
  if (!api.killed) api.kill('SIGTERM')
  if (!vite.killed) vite.kill('SIGTERM')
  setTimeout(() => process.exit(code), 250)
}

vite.on('exit', (code) => stop(code ?? 0))
api.on('exit', (code) => { if (!stopping && code) stop(code) })
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
