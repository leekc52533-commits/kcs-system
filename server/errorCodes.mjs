const rules=[
  ['DUPLICATE_BRANCH_SERVICE_DATE',/duplicate branch service date/i],
  ['ROUTE_GENERATION_DUPLICATES_UNRESOLVED',/route generation blocked.*duplicate/i],
  ['AUTH_REQUIRED',/请先登录|not authenticated/i],
  ['PERMISSION_DENIED',/没有权限|permission required|permission denied|not allowed/i],
  ['PASSWORD_CHANGE_REQUIRED',/首次登录必须先修改密码/i],
  ['INVALID_CREDENTIALS',/用户名或密码错误|current password.*incorrect/i],
  ['USERNAME_REQUIRED',/请输入用户名|username.*required/i],
  ['USERNAME_IN_USE',/用户名已经使用|username.*already/i],
  ['PASSWORD_TOO_SHORT',/密码至少需要|password.*at least/i],
  ['NOT_FOUND',/not found|不存在/i],
  ['INVALID_STATUS',/invalid.*status|status must/i],
  ['INVALID_FREQUENCY',/invalid collection frequency/i],
  ['INVALID_WEEKDAY',/invalid assigned weekday/i],
  ['INVALID_GPS',/invalid gps|invalid latitude|invalid longitude/i],
  ['REQUIRED_FIELD',/required|必须填写|请输入|请先选择/i],
  ['INVALID_LOCATION_TEXT',/location text.*cjk|地点.*中文/i],
  ['CONFLICT',/already|duplicate|重复|已经/i],
  ['REQUEST_TOO_LARGE',/too large|超过.*mb/i],
  ['INVALID_FILE',/attachment|image|document.*invalid|only jpg/i]
]

export function errorCodeFor(error){
  if(error?.code&&/^[A-Z][A-Z0-9_]+$/.test(error.code))return error.code
  const message=String(error?.message||error||'')
  return rules.find(([,pattern])=>pattern.test(message))?.[0]||'UNKNOWN_ERROR'
}

export function publicError(error){
  const errorCode=errorCodeFor(error)
  return{errorCode,error:errorCode==='UNKNOWN_ERROR'?'The request could not be completed.':errorCode}
}
