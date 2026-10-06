// Read-only directory classification. Never rewrite master status or history.
export const customerOperatingSql="(COALESCE(c.status,'')='active' AND COALESCE(c.is_active,0)=1)"
export const branchOperatingSql=`(COALESCE(b.lifecycle_status,'ACTIVE')='ACTIVE' AND COALESCE(b.status,'')='active' AND COALESCE(b.is_active,0)=1 AND ${customerOperatingSql})`
export const branchReviewStatusSql=`CASE
 WHEN COALESCE(b.lifecycle_status,'ACTIVE')<>'ACTIVE' THEN b.lifecycle_status
 WHEN b.status='closed' OR c.status='closed' THEN 'CLOSED'
 WHEN b.status='paused' OR c.status='paused' THEN 'TEMPORARILY_PAUSED'
 ELSE 'NOT_COLLECTING' END`
