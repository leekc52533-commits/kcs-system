// Log metadata only: never request bodies, query strings, cookies or credentials.
export function trackApiRequest(request,response,requestId,{log=entry=>console.info(JSON.stringify(entry)),now=()=>performance.now(),slowMs=5000}={}){
  const path=String(request.url||'').split('?')[0]
  if(!path.startsWith('/api/')||path==='/api/health')return
  const started=now(),base={requestId,method:request.method,path}
  // Start is recorded before synchronous database work; timers cannot run while
  // the event loop is blocked, so an unmatched start remains useful evidence.
  log({event:'api_request_started',...base})
  const timer=setTimeout(()=>log({event:'api_request_slow',...base,durationMs:Math.round(now()-started),phase:'pending'}),slowMs)
  timer.unref?.()
  let ended=false
  const end=phase=>{
    if(ended)return
    ended=true;clearTimeout(timer)
    const durationMs=Math.round(now()-started)
    log({event:durationMs>=slowMs?'api_request_slow':'api_request_finished',...base,durationMs,phase,status:response.statusCode})
  }
  response.once('finish',()=>end('finished'))
  response.once('close',()=>end(response.writableFinished?'finished':'disconnected'))
}
