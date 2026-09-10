# Company menu v61

Documents groups Purchase, Sales, Expenses and Void. Other items including Cash Float remain top level. The designated account can reorder top-level entries and document children with drag/drop or arrows; reset is a draft until saved. Other users see saved order on page load, focus or within 30 seconds. Existing visibility and route permissions remain unchanged. Driver execution tabs are unchanged; this is the management sidebar on desktop and mobile.

Migration pins the current active kcadmin account ID once. Writes check session ID against that stored ID, never role/name. Missing owner fails closed. No public owner-binding/transfer API. Migration is additive; company_menu stores layout and revision, company_menu_audit records each successful change. Stale writes fail atomically.

Deployment requires existing active kcadmin and schema 60/61, backs up DB/frontend, upgrades to 61 on restart and checks health/integrity. This does not redesign existing account/password-administration rights. Ownership recovery is deferred.
