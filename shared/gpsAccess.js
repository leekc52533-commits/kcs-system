export const canDirectEditGps=actor=>['supervisor','operations_admin','owner_admin'].includes(String(actor?.systemRole||actor?.role||'').trim().toLowerCase())
