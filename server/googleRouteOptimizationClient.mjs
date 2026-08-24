const transient=new Set([408,429,500,502,503,504])
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const safeError=(message,statusCode=502,code='GOOGLE_ROUTE_ERROR')=>Object.assign(new Error(message),{statusCode,code})
const routeOptimizationScope='https://www.googleapis.com/auth/cloud-platform'
const refreshSkewMs=5*60*1000

async function defaultAuthFactory(projectId){
  const {GoogleAuth}=await import('google-auth-library')
  return new GoogleAuth({projectId,scopes:[routeOptimizationScope]})
}

export class GoogleRouteOptimizationClient{
  constructor({fetchImpl=fetch,env=process.env,authFactory=defaultAuthFactory,now=Date.now}={}){this.fetch=fetchImpl;this.env=env;this.authFactory=authFactory;this.now=now;this.failures=0;this.openUntil=0;this.authClientPromise=null;this.cachedToken=null;this.refreshPromise=null}
  enabled(){return this.env.KCS_GOOGLE_ROUTE_OPTIMIZATION_ENABLED==='1'}
  authMode(){return this.env.GOOGLE_ROUTE_OPTIMIZATION_ACCESS_TOKEN?'static_token':this.env.GOOGLE_APPLICATION_CREDENTIALS?'adc':'none'}
  async adcClient(){
    if(!this.authClientPromise)this.authClientPromise=Promise.resolve(this.authFactory(this.env.GOOGLE_CLOUD_PROJECT)).then(auth=>auth.getClient())
    return this.authClientPromise
  }
  async refreshToken(){
    try{
      const client=await this.adcClient(),result=await client.getAccessToken(),token=typeof result==='string'?result:result?.token
      if(!token)throw new Error('missing token')
      const expiry=Number(client.credentials?.expiry_date)
      this.cachedToken={value:token,expiresAt:Number.isFinite(expiry)?expiry:this.now()+10*60*1000}
      return token
    }catch{
      this.authClientPromise=null
      this.cachedToken=null
      throw safeError('Google server authentication is unavailable; no changes were made.',503,'GOOGLE_AUTH_UNAVAILABLE')
    }
  }
  async token(){
    const override=this.env.GOOGLE_ROUTE_OPTIMIZATION_ACCESS_TOKEN
    if(override)return override
    if(!this.env.GOOGLE_APPLICATION_CREDENTIALS)throw safeError('Google server authentication is not configured; no changes were made.',503,'GOOGLE_AUTH_UNAVAILABLE')
    if(this.cachedToken&&this.cachedToken.expiresAt-this.now()>refreshSkewMs)return this.cachedToken.value
    if(!this.refreshPromise)this.refreshPromise=this.refreshToken().finally(()=>{this.refreshPromise=null})
    return this.refreshPromise
  }
  async request(url,options){if(this.now()<this.openUntil)throw safeError('Google routing circuit breaker is open; retry later.',503,'GOOGLE_CIRCUIT_OPEN');const timeout=Math.max(1000,Number(this.env.KCS_GOOGLE_ROUTE_TIMEOUT_MS||15000)),attempts=Math.min(3,Math.max(1,Number(this.env.KCS_GOOGLE_ROUTE_RETRY_LIMIT||2)+1));for(let attempt=0;attempt<attempts;attempt++){let response;try{response=await this.fetch(url,{...options,signal:AbortSignal.timeout(timeout)})}catch(error){if(attempt+1<attempts){await sleep(100*2**attempt);continue}this.failed();throw safeError(error?.name==='TimeoutError'?'Google routing timed out; no changes were made.':'Google routing is unavailable; no changes were made.',504)}if(response.ok){this.failures=0;return response.json()}if(!transient.has(response.status)||attempt+1===attempts){this.failed();const payload=await response.json().catch(()=>null),error=safeError(`Google routing rejected the request (${response.status}); no changes were made.`,response.status===429?429:502,response.status===429?'GOOGLE_QUOTA_EXHAUSTED':'GOOGLE_ROUTE_ERROR');error.diagnostic={providerStatus:response.status,providerCode:String(payload?.error?.status||'UNKNOWN').slice(0,80),providerMessage:String(payload?.error?.message||'No provider detail').slice(0,500)};throw error}await sleep(100*2**attempt)} }
  failed(){this.failures+=1;if(this.failures>=Math.max(2,Number(this.env.KCS_GOOGLE_ROUTE_CIRCUIT_FAILURES||3))){this.openUntil=this.now()+Math.max(1000,Number(this.env.KCS_GOOGLE_ROUTE_CIRCUIT_RESET_MS||60000));this.failures=0}}
  async optimize(model){if(!this.enabled())throw safeError('Google road optimization is disabled.',503,'GOOGLE_ROUTE_DISABLED');const project=this.env.GOOGLE_CLOUD_PROJECT;if(!project)throw safeError('Google Cloud project is not configured.',503,'GOOGLE_AUTH_UNAVAILABLE');const token=await this.token();return this.request(`https://routeoptimization.googleapis.com/v1/projects/${encodeURIComponent(project)}:optimizeTours`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Goog-User-Project':project},body:JSON.stringify(model)})}
  async geometry(origin,destination,intermediates=[]){const key=this.env.GOOGLE_ROUTES_API_KEY;if(!key)throw safeError('Google Routes API key is not configured.',503,'GOOGLE_AUTH_UNAVAILABLE');return this.request('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline'},body:JSON.stringify({origin:{location:{latLng:origin}},destination:{location:{latLng:destination}},intermediates:intermediates.map(latLng=>({location:{latLng}})),travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE',polylineQuality:'HIGH_QUALITY'})})}
  diagnostics(){const projectConfigured=Boolean(this.env.GOOGLE_CLOUD_PROJECT),authMode=this.authMode();return{enabled:this.enabled(),projectConfigured,authMode,ready:this.enabled()&&projectConfigured&&authMode!=='none',configured:projectConfigured&&authMode!=='none',routesConfigured:Boolean(this.env.GOOGLE_ROUTES_API_KEY),circuitOpen:this.now()<this.openUntil,provider:'Google Route Optimization API + Routes API'}}
}
