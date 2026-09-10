# No Goods notices (schema 59)

Today's assigned driver/crew may report No Goods on any unfinished, unbilled stop, before arrival and before departure approval. This is a notification, not permission to execute a trip. Contact method (call, WhatsApp, SMS or onsite), reason and photo evidence are required. The shared camera/gallery picker retains pending input on failure.

Mobile moves these records into a collapsed section after all trips. Office route cards provide a collapsed history with proof, employee and timestamp plus restore-with-reason. No Goods does not count as collected and does not create arrival evidence. Existing arrival evidence remains if the employee was already there. Recurrence is unchanged; completed stop storage prevents regeneration from recreating it. Pending date/defer requests are retained as superseded rejections, preventing stale approvals.

Restoration keeps the original proof and audit. Repeated reports after restoration create new history. A completed trip can reopen; if another trip for its vehicle is running, restoration waits until that trip ends to avoid two running trips. Restoration is limited to the same service date. Existing bills and ended stops cannot be overwritten. Uploaded files are removed on transaction failure. Read access is restricted to current assigned staff and management.

Approval signatures normalize notice status to its pre-notice value, so notification does not revoke an already-approved departure or approve a draft. Regular route changes still invalidate signatures.

Migration 58→59 adds only the notice table/index. Deployment script backs up database/frontend and verifies schema, integrity and service health. Automated service and rendered UI tests cover access, proof validation, rollback, skip/restore, duplicate retry, counts, recurrence, three languages and migration. Physical phone camera and production checks require deployment.
