// Company document reading does not confer mutation or approval rights.
export const canReadCompanyDocuments = context => ['owner','owner_admin','operations_admin','supervisor','office','dispatcher'].includes(String(context?.role || '').toLowerCase())
