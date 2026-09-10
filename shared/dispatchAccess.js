// Office and management share dispatch editing; driver/crew changes remain requests.
export const canManageDispatch=account=>['owner','owner_admin','operations_admin','supervisor','office','dispatcher'].includes(String(typeof account==='string'?account:account?.systemRole||account?.role||'').trim().toLowerCase())
