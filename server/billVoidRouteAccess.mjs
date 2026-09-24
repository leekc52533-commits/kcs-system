// Shared desktop/mobile entry points. Ownership and reviewer checks stay in services.
export function isEmployeeBillVoidRoute(pathname,method){
 if(method==='GET')return pathname==='/api/bill-voids'||/^\/api\/bill-voids\/\d+\/replacement$/.test(pathname)||/^\/api\/purchase-payment-proofs\/\d+\/photo$/.test(pathname)
 return method==='POST'&&/^\/api\/bill-voids\/\d+\/(request|replacement|replacement-proof)$/.test(pathname)
}
