// A client timeout cancels waiting, not server-side work. Callers must stop
// automatic retries after failure, especially for planning POST requests.
export async function requestWithTimeout(request,url,options={},timeoutMs=30000){
  const controller=new AbortController()
  let timer
  try{
    return await Promise.race([
      request(url,{...options,signal:controller.signal}),
      new Promise((_,reject)=>{timer=setTimeout(()=>{
        const error=Object.assign(new Error('REQUEST_TIMEOUT'),{code:'REQUEST_TIMEOUT'})
        reject(error);controller.abort()
      },timeoutMs)}),
    ])
  }finally{clearTimeout(timer)}
}
